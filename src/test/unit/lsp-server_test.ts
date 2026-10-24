/// <reference types="node" />
import {mkdir, mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
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
    /** A button. */
    @customElement('x-button')
    export class XButton extends LitElement {
      /** How big. */
      @property() size: 'small' | 'large' = 'small';
    }
  `,
};

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'lit-lsp-')));
  for (const [file, code] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), code);
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
    expect(hover.range).toEqual({
      start: {line: 1, character: 6},
      end: {line: 1, character: 14},
    });
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
