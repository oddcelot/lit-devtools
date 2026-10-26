/// <reference types="node" />
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {PassThrough} from 'node:stream';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, test} from 'vite-plus/test';
import {startServer} from '../../../packages/lit-language-server/src/server.js';

/** A minimal LSP client over in-memory streams. */
const createClient = () => {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  startServer({input: toServer, output: fromServer});
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map<number, (result: unknown) => void>();
  const notifications: {method: string; params: any}[] = [];
  const waiters: (() => void)[] = [];
  fromServer.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const sep = buffer.indexOf('\r\n\r\n');
      if (sep < 0) return;
      const length = Number(
        /Content-Length: (\d+)/i.exec(buffer.subarray(0, sep).toString())![1]
      );
      if (buffer.length < sep + 4 + length) return;
      const message = JSON.parse(
        buffer.subarray(sep + 4, sep + 4 + length).toString()
      );
      buffer = buffer.subarray(sep + 4 + length);
      if (message.id !== undefined && !message.method) {
        pending.get(message.id)?.(message.result);
        pending.delete(message.id);
      } else if (message.method && message.id !== undefined) {
        send({id: message.id, result: null});
      } else if (message.method) {
        notifications.push(message);
        waiters.splice(0).forEach((wake) => wake());
      }
    }
  });
  const send = (message: object) => {
    const text = JSON.stringify({jsonrpc: '2.0', ...message});
    toServer.write(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
  };
  return {
    request: <T = any>(method: string, params: unknown) =>
      new Promise<T>((resolve) => {
        const id = nextId++;
        pending.set(id, resolve as (result: unknown) => void);
        send({id, method, params});
      }),
    notify: (method: string, params: unknown) => send({method, params}),
    /** The first notification that matches, waiting for it if need be. */
    async waitFor(match: (n: {method: string; params: any}) => boolean) {
      for (;;) {
        const found = notifications.find(match);
        if (found) return found;
        await new Promise<void>((wake) => waiters.push(wake));
      }
    },
  };
};

let root: string;
const files: Record<string, string> = {
  'package.json': '{"name": "app"}',
  'lit-devtools.config.json': JSON.stringify({languageServer: {colours: true}}),
  'src/x-button.ts': `
    import {LitElement, html} from 'lit';
    import {customElement, property} from 'lit/decorators.js';
    /**
     * A button.
     * @cssprop [--x-button-gap=4px] - The gap.
     * @csspart base - The button.
     */
    @customElement('x-button')
    export class XButton extends LitElement {
      /** How big. */
      @property() size: 'small' | 'large' = 'small';
      pick() {
        this.dispatchEvent(new CustomEvent('pick', {detail: {size: this.size, at: 1}}));
      }
    }
  `,
  'index.html': '<x-button size="large"></x-button>\n',
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
  'src/x-typed.ts': `
    import {LitElement} from 'lit';
    import {customElement, property} from 'lit/decorators.js';
    @customElement('x-typed')
    export class XTyped extends LitElement {
      @property() size: 'small' | 'large' = 'small';
    }
    declare global {
      interface HTMLElementTagNameMap { 'x-typed': XTyped }
    }
  `,
};

/** The range of the `nth` `needle` in `code`, as LSP positions. */
const rangeOf = (code: string, needle: string, nth = 0) => {
  let offset = -1;
  for (let i = 0; i <= nth; i++) offset = code.indexOf(needle, offset + 1);
  const position = (at: number) => {
    const lines = code.slice(0, at).split('\n');
    return {line: lines.length - 1, character: lines.at(-1)!.length};
  };
  return {start: position(offset), end: position(offset + needle.length)};
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-lsp-')));
  for (const [file, code] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), code);
  }
  // What the check on save runs: the repo's TypeScript, over Lit's types.
  const repo = decodeURIComponent(
    new URL('../../..', import.meta.url).pathname
  );
  await mkdir(join(root, 'node_modules'));
  for (const dep of ['lit', 'typescript']) {
    await symlink(
      join(repo, 'node_modules', dep),
      join(root, 'node_modules', dep)
    );
  }
});

afterAll(() => rm(root, {recursive: true, force: true}));

/** The position of `‸` in `text`, and the text without it. */
const at = (text: string) => {
  const before = text.slice(0, text.indexOf('‸')).split('\n');
  return {
    text: text.replace('‸', ''),
    position: {line: before.length - 1, character: before.at(-1)!.length},
  };
};

describe('the language server', () => {
  const client = createClient();
  const appUri = () => pathToFileURL(join(root, 'src/app.ts')).href;

  test('initializes with completion and hover', async () => {
    const result = await client.request('initialize', {
      processId: null,
      rootUri: pathToFileURL(root).href,
      capabilities: {},
    });
    client.notify('initialized', {});
    expect(result.capabilities).toMatchObject({
      completionProvider: {
        triggerCharacters: expect.arrayContaining(['<', '.', '@']),
      },
      hoverProvider: true,
    });
  });

  test('completes attributes in an open template', async () => {
    const {text, position} = at(
      "import {html} from 'lit';\nhtml`<x-button ‸>`;\n"
    );
    client.notify('textDocument/didOpen', {
      textDocument: {uri: appUri(), languageId: 'typescript', version: 1, text},
    });
    const items = await client.request('textDocument/completion', {
      textDocument: {uri: appUri()},
      position,
    });
    expect(items[0]).toMatchObject({
      label: 'size',
      detail: "'small' | 'large'",
      documentation: {kind: 'markdown'},
      sortText: '00000',
      textEdit: {range: {start: position, end: position}, newText: 'size'},
    });
    // Global attributes follow the element's own.
    expect(items.map((item: {label: string}) => item.label)).toContain('id');
  });

  test('hovers a tag', async () => {
    const {position} = at("import {html} from 'lit';\nhtml`<x-but‸ton >`;\n");
    const hover = await client.request('textDocument/hover', {
      textDocument: {uri: appUri()},
      position,
    });
    expect(hover.contents.value).toContain('**`<x-button>`**');
    // Where it was read, relative to the workspace, not the whole path.
    expect(hover.contents.value).toContain('_`src/x-button.ts`_');
    expect(hover.contents.value).not.toContain(root);
    expect(hover.range).toEqual({
      start: {line: 1, character: 6},
      end: {line: 1, character: 14},
    });
  });

  test('goes to where a tag, attribute or event is declared', async () => {
    const uri = pathToFileURL(join(root, 'src/nav.ts')).href;
    const text =
      'import {html} from \'lit\';\nhtml`<x-button size="small" @pick=${() => {}}></x-button>`;\n';
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    const source = files['src/x-button.ts'];
    const button = pathToFileURL(join(root, 'src/x-button.ts')).href;
    const goTo = (method: string, needle: string) =>
      client.request(method, {
        textDocument: {uri},
        position: rangeOf(text, needle).start,
      });
    expect(await goTo('textDocument/implementation', 'x-button')).toEqual([
      {uri: button, range: rangeOf(source, 'XButton')},
    ]);
    expect(await goTo('textDocument/implementation', 'size')).toEqual([
      {uri: button, range: rangeOf(source, 'size')},
    ]);
    // Definition answers the same, so F12 works as well.
    expect(await goTo('textDocument/definition', 'pick')).toEqual([
      {uri: button, range: rangeOf(source, 'pick', 1)},
    ]);
  });

  test('finds the uses of a tag and an attribute across files', async () => {
    const uri = pathToFileURL(join(root, 'src/nav.ts')).href;
    const page = pathToFileURL(join(root, 'index.html')).href;
    const text =
      'import {html} from \'lit\';\nhtml`<x-button size="small" @pick=${() => {}}></x-button>`;\n';
    const references = (needle: string, includeDeclaration: boolean) =>
      client.request<{uri: string; range: unknown}[]>(
        'textDocument/references',
        {
          textDocument: {uri},
          position: rangeOf(text, needle).start,
          context: {includeDeclaration},
        }
      );
    const tags = await references('x-button', false);
    expect(tags.filter((ref) => ref.uri === uri)).toEqual([
      {uri, range: rangeOf(text, 'x-button')},
      {uri, range: rangeOf(text, 'x-button', 1)},
    ]);
    expect(tags.filter((ref) => ref.uri === page)).toHaveLength(2);
    const sizes = await references('size', true);
    const button = pathToFileURL(join(root, 'src/x-button.ts')).href;
    expect(sizes).toEqual(
      expect.arrayContaining([
        {uri: button, range: rangeOf(files['src/x-button.ts'], 'size')},
        {uri, range: rangeOf(text, 'size')},
        {uri: page, range: rangeOf(files['index.html'], 'size')},
      ])
    );
  });

  test('answers in TSX, Astro and MDX files', async () => {
    const cases = [
      [
        'src/view.tsx',
        'typescriptreact',
        'export const V = () => <x-button ‸ />;\n',
      ],
      ['src/page.astro', 'astro', '---\nconst a = 1;\n---\n<x-button ‸ />\n'],
      ['src/doc.mdx', 'mdx', '# Doc\n\n<x-button ‸ />\n'],
    ];
    for (const [file, languageId, source] of cases) {
      const uri = pathToFileURL(join(root, file)).href;
      const {text, position} = at(source);
      client.notify('textDocument/didOpen', {
        textDocument: {uri, languageId, version: 1, text},
      });
      const items = await client.request<{label: string}[]>(
        'textDocument/completion',
        {textDocument: {uri}, position}
      );
      const labels = items.map((item) => item.label);
      expect(labels, file).toContain('size');
      // An event is an on<event> prop in JSX, and nothing in Astro.
      expect(labels.includes('onpick'), file).toBe(languageId !== 'astro');
    }
  });

  test('hovers a standard element in a template', async () => {
    const uri = pathToFileURL(join(root, 'src/native.ts')).href;
    const {text, position} = at(
      "import {html} from 'lit';\nhtml`<butt‸on></button>`;\n"
    );
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    const hover = await client.request('textDocument/hover', {
      textDocument: {uri},
      position,
    });
    expect(hover.contents.value).toMatch(
      /^\*\*`<button>`\*\*\n\nThe button element/
    );
  });

  test('knows SVG elements and their attributes in a template', async () => {
    const uri = pathToFileURL(join(root, 'src/icon.ts')).href;
    const lines = [
      "import {html} from 'lit';",
      'html`<svg viewBox="0 0 28 28"><path d="M3 9Z" stroke-linejoin="" /></svg>`;',
      'html`<div ></div>`;',
      '',
    ];
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text: lines.join('\n'),
      },
    });
    const at = (line: number, after: string) => ({
      textDocument: {uri},
      position: {line, character: lines[line].indexOf(after) + after.length},
    });
    const hover = await client.request('textDocument/hover', at(1, '<pa'));
    expect(hover.contents.value).toMatch(
      /^\*\*`<path>`\*\*\n\nSVG element\. The generic shape/
    );
    const values = await client.request<{label: string}[]>(
      'textDocument/completion',
      at(1, 'stroke-linejoin="')
    );
    expect(values.map((item) => item.label)).toEqual([
      'miter',
      'miter-clip',
      'round',
      'bevel',
      'arcs',
    ]);
    const onPath = await client.request<{label: string}[]>(
      'textDocument/completion',
      at(1, '<path ')
    );
    expect(onPath.map((item) => item.label)).toEqual(
      expect.arrayContaining(['pathLength', 'stroke-width'])
    );
    const shared = await client.request(
      'textDocument/hover',
      at(1, 'stroke-line')
    );
    expect(shared.contents.value).toMatch(
      /^\*\*`stroke-linejoin`\*\* attribute of every SVG element/
    );
    const onDiv = await client.request<{label: string}[]>(
      'textDocument/completion',
      at(2, '<div ')
    );
    expect(onDiv.map((item) => item.label)).not.toContain('stroke-width');
  });

  test('offers DOM events after @ on any element', async () => {
    const uri = pathToFileURL(join(root, 'src/events.ts')).href;
    const {text, position} = at(
      "import {html} from 'lit';\nhtml`<main @‸></main>`;\n"
    );
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    const items = await client.request<{label: string}[]>(
      'textDocument/completion',
      {
        textDocument: {uri},
        position,
      }
    );
    expect(items.map((item) => item.label)).toEqual(
      expect.arrayContaining(['click', 'input', 'keydown'])
    );
  });

  test('leaves standard elements in an HTML file to the HTML server', async () => {
    const uri = pathToFileURL(join(root, 'index.html')).href;
    const {text, position} = at('<!doctype html>\n<butt‸on></button>\n');
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'html', version: 1, text},
    });
    const hover = await client.request('textDocument/hover', {
      textDocument: {uri},
      position,
    });
    expect(hover).toBeNull();
  });

  test('types an inline handler: member completion, code action, inlay hint', async () => {
    const uri = pathToFileURL(join(root, 'src/handler.ts')).href;
    const {text, position} = at(
      "import {html} from 'lit';\nhtml`<main @pick=${(ev) => ev.detail.‸}></main>`;\n"
    );
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    const items = await client.request<{label: string; detail: string}[]>(
      'textDocument/completion',
      {textDocument: {uri}, position}
    );
    expect(items.map((item) => [item.label, item.detail])).toEqual([
      ['size', "'small' | 'large'"],
      ['at', 'number'],
    ]);
    const type = "CustomEvent<{size: 'small' | 'large'; at: number}>";
    const whole = {
      start: {line: 0, character: 0},
      end: {line: 2, character: 0},
    };
    const actions = await client.request('textDocument/codeAction', {
      textDocument: {uri},
      range: whole,
      context: {diagnostics: []},
    });
    expect(actions).toMatchObject([
      {
        title: `Add event type ${type}`,
        kind: 'quickfix',
        edit: {
          changes: {
            [uri]: [
              {
                range: {
                  start: {line: 1, character: 20},
                  end: {line: 1, character: 22},
                },
                newText: `ev: ${type}`,
              },
            ],
          },
        },
      },
    ]);
    const hints = await client.request('textDocument/inlayHint', {
      textDocument: {uri},
      range: whole,
    });
    expect(hints).toEqual([
      {position: {line: 1, character: 22}, label: `: ${type}`, kind: 1},
    ]);
  });

  test('reports a method handler whose parameter does not fit the event', async () => {
    const uri = pathToFileURL(join(root, 'src/mismatch.ts')).href;
    const text = [
      "import {LitElement, html} from 'lit';",
      'class App extends LitElement {',
      '  render() {',
      '    return html`<main @pick=${this.#onPick}></main>`;',
      '  }',
      '  #onPick(e: CustomEvent<{thing: string}>) {}',
      '}',
      '',
    ].join('\n');
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    const published = await client.waitFor(
      (n) =>
        n.method === 'textDocument/publishDiagnostics' &&
        n.params.uri === uri &&
        n.params.diagnostics.length > 0
    );
    expect(published.params.diagnostics).toEqual([
      {
        range: {start: {line: 3, character: 30}, end: {line: 3, character: 42}},
        severity: 1,
        source: 'lit',
        code: 'event-type',
        message:
          "`#onPick` takes `CustomEvent<{thing: string}>`, but `pick` sends `CustomEvent<{size: 'small' | 'large'; at: number}>`: `detail.thing` is missing.",
      },
    ]);
  });

  test('offers to add a component missing from HTMLElementTagNameMap', async () => {
    const uri = pathToFileURL(join(root, 'src/x-unmapped.ts')).href;
    const text = [
      "import {LitElement} from 'lit';",
      "@customElement('x-unmapped')",
      'export class XUnmapped extends LitElement {}',
      '',
    ].join('\n');
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    const published = await client.waitFor(
      (n) =>
        n.method === 'textDocument/publishDiagnostics' &&
        n.params.uri === uri &&
        n.params.diagnostics.length > 0
    );
    const [diagnostic] = published.params.diagnostics;
    expect(diagnostic).toMatchObject({
      range: rangeOf(text, "'x-unmapped'"),
      severity: 2,
      code: 'missing-element-type',
    });
    const actions = await client.request('textDocument/codeAction', {
      textDocument: {uri},
      range: diagnostic.range,
      context: {diagnostics: [diagnostic]},
    });
    expect(actions).toEqual([
      expect.objectContaining({
        title: "Add 'x-unmapped' to HTMLElementTagNameMap",
        edit: {
          changes: {
            [uri]: [
              {
                range: {
                  start: {line: 3, character: 0},
                  end: {line: 3, character: 0},
                },
                newText:
                  "\ndeclare global {\n  interface HTMLElementTagNameMap {\n    'x-unmapped': XUnmapped;\n  }\n}\n",
              },
            ],
          },
        },
      }),
    ]);
  });

  test('type-checks a script’s bindings when it is saved', async () => {
    const file = join(root, 'src/saved.ts');
    const uri = pathToFileURL(file).href;
    const text = [
      "import {html} from 'lit';",
      "import './x-typed.js';",
      'export const view = (name: string) =>',
      '  html`<x-typed .size=${name}></x-typed>`;',
      '',
    ].join('\n');
    await writeFile(file, text);
    client.notify('textDocument/didOpen', {
      textDocument: {uri, languageId: 'typescript', version: 1, text},
    });
    client.notify('textDocument/didSave', {textDocument: {uri}});
    const published = await client.waitFor(
      (n) =>
        n.method === 'textDocument/publishDiagnostics' &&
        n.params.uri === uri &&
        n.params.diagnostics.some(
          (d: {code: string}) => d.code === 'binding-type'
        )
    );
    expect(
      published.params.diagnostics.filter(
        (d: {code: string}) => d.code === 'binding-type'
      )
    ).toEqual([
      expect.objectContaining({
        range: rangeOf(text, 'name', 1),
        severity: 1,
        message: '`.size` takes `"large" | "small"`, but this is `string`.',
      }),
    ]);
  }, 60_000);

  test('answers CSS in css templates: completion, hover, problems', async () => {
    const uri = pathToFileURL(join(root, 'src/styles.ts')).href;
    const lines = [
      "import {css} from 'lit';",
      'const styles = css`',
      '  :host { colo: red; }',
      '  .a { margin: ${gap}; }',
      '  .b { gap: var(--x-b); }',
      // A selector, and a block's whole body, from expressions.
      '  ${selector} {',
      '    cursor: pointer;',
      '  }',
      '  :root {',
      '    ${tokens}',
      '  }',
      '`;',
      '',
    ];
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text: lines.join('\n'),
      },
    });
    const properties = await client.request<{label: string}[]>(
      'textDocument/completion',
      {
        textDocument: {uri},
        position: {line: 2, character: 14},
      }
    );
    expect(properties.map((item) => item.label)).toContain('color');
    const documented = await client.request<{label: string}[]>(
      'textDocument/completion',
      {
        textDocument: {uri},
        position: {line: 4, character: 21},
      }
    );
    expect(documented[0]).toMatchObject({
      label: '--x-button-gap',
      detail: '= 4px from <x-button>',
    });
    const hover = await client.request('textDocument/hover', {
      textDocument: {uri},
      position: {line: 3, character: 9},
    });
    expect(JSON.stringify(hover.contents)).toContain('margin');
    const published = await client.waitFor(
      (n) =>
        n.method === 'textDocument/publishDiagnostics' &&
        n.params.uri === uri &&
        n.params.diagnostics.length > 0
    );
    // The unknown property is reported; the lines with a hole aren't, nor
    // the rules around them, which parse as they will at runtime.
    expect(published.params.diagnostics).toMatchObject([
      {range: {start: {line: 2}}, severity: 2, source: 'lit', code: 'css'},
    ]);
    expect(published.params.diagnostics[0].message).toContain('colo');
  });

  test('reads a component typed into a buffer, before it is saved', async () => {
    const uri = pathToFileURL(join(root, 'src/x-chip.ts')).href;
    client.notify('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 1,
        text: "import {LitElement} from 'lit';\nimport {customElement} from 'lit/decorators.js';\n@customElement('x-chip') export class XChip extends LitElement {}\n",
      },
    });
    const {text, position} = at("import {html} from 'lit';\nhtml`<x-‸`;\n");
    client.notify('textDocument/didChange', {
      textDocument: {uri: appUri(), version: 2},
      contentChanges: [{text}],
    });
    const items = await client.request<{label: string}[]>(
      'textDocument/completion',
      {
        textDocument: {uri: appUri()},
        position,
      }
    );
    // Components first, then standard elements.
    expect(items.map((item) => item.label).slice(0, 2)).toEqual([
      'x-button',
      'x-chip',
    ]);
    expect(items.map((item) => item.label)).toContain('div');
  });

  test('reports settings problems on the config file', async () => {
    const configUri = pathToFileURL(
      join(root, 'lit-devtools.config.json')
    ).href;
    const published = await client.waitFor(
      (n) =>
        n.method === 'textDocument/publishDiagnostics' &&
        n.params.uri === configUri
    );
    expect(published.params.diagnostics).toMatchObject([
      {message: 'Unknown setting `colours`.', range: {start: {line: 0}}},
    ]);
  });

  test('reads the settings again when the config file changes', async () => {
    const config = join(root, 'lit-devtools.config.json');
    const configUri = pathToFileURL(config).href;
    await writeFile(config, JSON.stringify({languageServer: {}}));
    client.notify('workspace/didChangeWatchedFiles', {
      changes: [{uri: configUri, type: 2}],
    });
    // The workspace is read again on its next use.
    await client.request('textDocument/hover', {
      textDocument: {uri: appUri()},
      position: {line: 0, character: 0},
    });
    const cleared = await client.waitFor(
      (n) =>
        n.method === 'textDocument/publishDiagnostics' &&
        n.params.uri === configUri &&
        n.params.diagnostics.length === 0
    );
    expect(cleared.params.diagnostics).toEqual([]);
  });
});
