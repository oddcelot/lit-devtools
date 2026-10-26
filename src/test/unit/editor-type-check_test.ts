/// <reference types="node" />
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterAll, beforeAll, describe, expect, test} from 'vite-plus/test';
import {
  bindingMessage,
  parseTscOutput,
  shadowSource,
  toSource,
  wrapAt,
} from '../../lib/editor/type-check.js';
import {checkBindingTypes} from '../../lib/editor/type-check-run.js';
import {createWorkspace} from '../../lib/editor/workspace.js';

const shadowOf = (code: string, eventType?: string) =>
  shadowSource(
    {file: '/app/src/app.ts', code, kind: 'script'},
    async () => eventType
  );

describe('shadowSource', () => {
  test('wraps each kind of binding in place, and maps offsets back', async () => {
    const code =
      'html`<x-a .size=${s} title=${t} ?hidden=${h} @go=${g} class="a ${c}">`;';
    const shadow = (await shadowOf(code, 'CustomEvent<number>'))!;
    expect(shadow.text).toBe(
      "html`<x-a .size=${__litProp<'x-a', 'size'>((s))} title=${__litAttr((t))} ?hidden=${__litBool((h))} @go=${__litEvent<'go', CustomEvent<number>>((g))} class=\"a ${c}\">`;"
    );
    const at = shadow.text.indexOf('((h))') + 2;
    expect(code[toSource(shadow.insertions, at)]).toBe('h');
    expect(wrapAt(shadow.wraps, code.indexOf('h}'))?.name).toBe('hidden');
  });

  test('a nested template is wrapped inside the outer binding, innermost wins', async () => {
    const code = 'html`<x-a .render=${() => html`<x-b .n=${n}>`}>`;';
    const shadow = (await shadowOf(code))!;
    expect(shadow.text).toContain("__litProp<'x-b', 'n'>((n))");
    expect(wrapAt(shadow.wraps, code.indexOf('n}'))?.name).toBe('n');
  });

  test('calls to directives are left alone', async () => {
    const code = `
      import {live} from 'lit/directives/live.js';
      const mine = directive(Mine);
      html\`<input .value=\${live(v)} .x=\${mine(1)} .y=\${format(v)}>\`;
    `;
    const shadow = (await shadowOf(code))!;
    expect(shadow.wraps.map((wrap) => wrap.name)).toEqual(['y']);
  });

  test('nothing to check, no copy', async () => {
    expect(await shadowOf('html`<p>${text}</p>`;')).toBeUndefined();
  });
});

test('parseTscOutput reads a diagnostic and its elaboration', () => {
  expect(
    parseTscOutput(
      "src/a.ts(3,7): error TS2345: Argument of type 'x' is not assignable to parameter of type 'y'.\n  Type 'x' is not 'y'.\nerror TS5083: Cannot read file.\n"
    )
  ).toEqual([
    {
      file: 'src/a.ts',
      line: 3,
      column: 7,
      code: 2345,
      message: [
        "Argument of type 'x' is not assignable to parameter of type 'y'.",
        "Type 'x' is not 'y'.",
      ],
    },
  ]);
});

test('bindingMessage says it in the binding’s terms', () => {
  const wrap = {
    binding: '.' as const,
    name: 'size',
    tag: 'x-a',
    start: 0,
    end: 1,
  };
  expect(
    bindingMessage(wrap, {
      file: '',
      line: 1,
      column: 1,
      code: 2345,
      message: [
        'Argument of type \'string\' is not assignable to parameter of type \'"a" | "b" | __LitSpecial\'.',
      ],
    })
  ).toBe('`.size` takes `"a" | "b"`, but this is `string`.');
});

describe('checkBindingTypes, with the repo’s TypeScript', () => {
  let root: string;
  const repo = decodeURIComponent(
    new URL('../../..', import.meta.url).pathname
  );

  const files: Record<string, string> = {
    'package.json': '{"name": "app", "private": true, "type": "module"}',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        lib: ['es2022', 'DOM'],
        experimentalDecorators: true,
        useDefineForClassFields: false,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['src'],
    }),
    'src/x-button.ts': `
      import {LitElement} from 'lit';
      import {customElement, property} from 'lit/decorators.js';
      @customElement('x-button')
      export class XButton extends LitElement {
        @property() size: 'small' | 'large' = 'small';
      }
      declare global {
        interface HTMLElementTagNameMap { 'x-button': XButton }
      }
    `,
    'src/app.ts': `
      import {LitElement, html} from 'lit';
      import './x-button.js';
      export class XApp extends LitElement {
        name = 'x';
        render() {
          return html\`<x-button .size=\${this.name} title=\${this.missing}
            @click=\${(e: MouseEvent) => e}></x-button>
            <x-plain .anything=\${1}></x-plain>\`;
        }
      }
    `,
  };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'lit-type-check-'));
    for (const [name, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, name)), {recursive: true});
      await writeFile(join(root, name), text);
    }
    await mkdir(join(root, 'node_modules'));
    for (const dep of ['lit', 'typescript']) {
      await symlink(
        join(repo, 'node_modules', dep),
        join(root, 'node_modules', dep)
      );
    }
  });

  afterAll(() => rm(root, {recursive: true, force: true}));

  test('reports what the wrapping finds, not what tsc reports in the source', async () => {
    const workspace = (await createWorkspace(root))!;
    try {
      const result = await checkBindingTypes(workspace, root);
      expect(result.notes).toEqual([]);
      expect(result.unmapped).toEqual(['x-plain']);
      expect(
        result.problems.map(({file, line, message}) => ({
          file: file.slice(file.lastIndexOf('/src/') + 1),
          line,
          message,
        }))
      ).toEqual([
        {
          file: 'src/app.ts',
          line: 7,
          message: '`.size` takes `"large" | "small"`, but this is `string`.',
        },
      ]);
    } finally {
      await workspace.close();
    }
  }, 60_000);
});
