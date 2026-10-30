/// <reference types="node" />
// The language server's performance budget, over LSP, in a monorepo of
// 2,000 component files: the first answer, which reads the whole workspace,
// within 2 s, and completion and hover within 50 ms once warm. Each is the
// median of several (fresh servers for the cold one), so one slow tick on a
// busy machine doesn't fail it. On 2026-10-24
// extractModuleDocs took 0.35 ms a file on playground/src, so reading 2,000
// files is about 0.7 s of the cold budget.
//
// It lives in the e2e project, not unit: e2e files run one at a time, so
// the timings aren't taken while a dozen other test files share the CPU,
// and generating and reading 2,000 files (about 5 s here) stays out of
// `test:unit`, which CI, both release workflows and local runs wait on.
import {mkdir, mkdtemp, realpath, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, test} from 'vite-plus/test';
import {at, createClient, linkRepoDeps, writeFiles} from '../lsp-client.js';

const PACKAGES = 10;
const PER_PACKAGE = 200;
const COLD_BUDGET_MS = 2000;
const WARM_BUDGET_MS = 50;
const COLD_SAMPLES = 3;
const WARM_UP = 5;
const SAMPLES = 21;

const tagOf = (pkg: number, n: number) => `p${pkg}-item-${n}`;

/** A component as one is written: docs, properties, an event, a base class. */
const component = (pkg: number, n: number): string => {
  const name = `P${pkg}Item${n}`;
  // Every tenth extends the previous package's first component.
  const base = pkg > 0 && n % 10 === 0 ? `P${pkg - 1}Item0` : 'LitElement';
  const baseImport =
    base === 'LitElement'
      ? ''
      : `import {${base}} from '@perf/p${pkg - 1}/src/${tagOf(pkg - 1, 0)}.js';\n`;
  return `import {LitElement, html, css} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
${baseImport}
/**
 * Item ${n} of package ${pkg}.
 * @slot - The content.
 * @csspart base - The wrapper.
 * @cssprop [--${tagOf(pkg, n)}-gap=4px] - The gap.
 * @fires pick - When picked.
 */
@customElement('${tagOf(pkg, n)}')
export class ${name} extends ${base} {
  static styles = css\`:host { display: block; gap: var(--${tagOf(pkg, n)}-gap); }\`;
  /** How big. */
  @property() size: 'small' | 'medium' | 'large' = 'small';
  /** Whether it is off. */
  @property({type: Boolean, reflect: true}) disabled = false;
  /** How many. */
  @property({type: Number}) count = 0;
  @state() private open = false;
  pick() {
    this.dispatchEvent(new CustomEvent('pick', {detail: {count: this.count}}));
  }
  render() {
    return html\`<div part="base" @click=\${this.pick}><slot></slot></div>\`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    '${tagOf(pkg, n)}': ${name};
  }
}
`;
};

const fixture = (): Record<string, string> => {
  const files: Record<string, string> = {
    'package.json': '{"name": "perf", "private": true}',
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
  };
  for (let pkg = 0; pkg < PACKAGES; pkg++) {
    files[`packages/p${pkg}/package.json`] = JSON.stringify({
      name: `@perf/p${pkg}`,
      ...(pkg > 0
        ? {dependencies: {[`@perf/p${pkg - 1}`]: 'workspace:*'}}
        : {}),
    });
    for (let n = 0; n < PER_PACKAGE; n++) {
      files[`packages/p${pkg}/src/${tagOf(pkg, n)}.ts`] = component(pkg, n);
    }
  }
  return files;
};

const median = (values: number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

let root: string;

beforeAll(async () => {
  // In the OS's temp folder, not .e2e-tmp: under this repo the first tag
  // completion also reads the repo's own node_modules for dependency
  // manifests, which took the cold answer from 1 s to 3 s, and a project
  // has its own node_modules, not this repo's.
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-lsp-perf-')));
  await writeFiles(root, fixture());
  await linkRepoDeps(root, ['lit']);
  // What `pnpm install` links: each package's workspace dependency.
  for (let pkg = 1; pkg < PACKAGES; pkg++) {
    const scope = join(root, `packages/p${pkg}/node_modules/@perf`);
    await mkdir(scope, {recursive: true});
    await symlink(
      join(root, `packages/p${pkg - 1}`),
      join(scope, `p${pkg - 1}`)
    );
  }
});

afterAll(() => rm(root, {recursive: true, force: true}));

describe('the language server in a 2,000-file monorepo', () => {
  let client: ReturnType<typeof createClient>;
  const last = tagOf(PACKAGES - 1, PER_PACKAGE - 1);
  const file = () => join(root, 'packages/p0/src/view.ts');
  const uri = () => pathToFileURL(file()).href;
  const tagCompletion = at("import {html} from 'lit';\nhtml`<‸`;\n");
  const timed = async <T>(run: () => Promise<T>) => {
    const start = performance.now();
    const result = await run();
    return {result, ms: performance.now() - start};
  };

  test('answers its first request, which reads the workspace, within 2 s', async () => {
    // A fresh server per sample, each reading the workspace from scratch.
    const times: number[] = [];
    for (let i = 0; i < COLD_SAMPLES; i++) {
      client = createClient();
      await client.request('initialize', {
        processId: null,
        rootUri: pathToFileURL(root).href,
        capabilities: {},
      });
      client.notify('initialized', {});
      const {result, ms} = await timed(() => {
        client.notify('textDocument/didOpen', {
          textDocument: {
            uri: uri(),
            languageId: 'typescript',
            version: 1,
            text: tagCompletion.text,
          },
        });
        return client.request<{label: string}[]>('textDocument/completion', {
          textDocument: {uri: uri()},
          position: tagCompletion.position,
        });
      });
      // Every package was read: the last package's last component is offered.
      expect(result.map((item) => item.label)).toContain(last);
      times.push(ms);
    }
    const ms = median(times);
    console.info(
      `cold index and first completion, median of ${COLD_SAMPLES}: ${ms.toFixed(0)} ms (${times.map((t) => t.toFixed(0)).join(', ')})`
    );
    expect(ms).toBeLessThan(COLD_BUDGET_MS);
  });

  /** The median time of `run`, after a few runs to warm it up. */
  const warmMedian = async (run: () => Promise<unknown>) => {
    for (let i = 0; i < WARM_UP; i++) await run();
    const times: number[] = [];
    for (let i = 0; i < SAMPLES; i++) times.push((await timed(run)).ms);
    return median(times);
  };
  const edit = (text: string, version: number) =>
    client.notify('textDocument/didChange', {
      textDocument: {uri: uri(), version},
      contentChanges: [{text}],
    });

  test('completes an attribute and hovers a tag within 50 ms once warm', async () => {
    const attribute = at(
      `import {html} from 'lit';\nhtml\`<${last} ‸></${last}>\`;\n`
    );
    edit(attribute.text, 2);
    const completion = () =>
      client.request<{label: string}[]>('textDocument/completion', {
        textDocument: {uri: uri()},
        position: attribute.position,
      });
    const hover = () =>
      client.request<{contents: {value: string}}>('textDocument/hover', {
        textDocument: {uri: uri()},
        // On the tag's name.
        position: {line: 1, character: 8},
      });
    // Real answers, not empty ones that came back fast.
    expect((await completion()).map((item) => item.label)).toContain('size');
    expect((await hover()).contents.value).toContain(`**\`<${last}>\`**`);
    const ms = {
      completion: await warmMedian(completion),
      hover: await warmMedian(hover),
    };
    console.info(
      `warm medians of ${SAMPLES}: attribute completion ${ms.completion.toFixed(1)} ms, hover ${ms.hover.toFixed(1)} ms`
    );
    expect(ms.completion).toBeLessThan(WARM_BUDGET_MS);
    expect(ms.hover).toBeLessThan(WARM_BUDGET_MS);
  });

  // Completing a tag name reads the docs of every tag, so it leans on the
  // source index finding a tag without a scan and keeping what it built.
  test('completes a tag name within 50 ms once warm', async () => {
    edit(tagCompletion.text, 3);
    const completion = () =>
      client.request<{label: string}[]>('textDocument/completion', {
        textDocument: {uri: uri()},
        position: tagCompletion.position,
      });
    expect((await completion()).map((item) => item.label)).toContain(last);
    const ms = await warmMedian(completion);
    console.info(
      `warm median of ${SAMPLES}: tag completion ${ms.toFixed(1)} ms`
    );
    expect(ms).toBeLessThan(WARM_BUDGET_MS);
  });
});
