/// <reference types="node" />
// What the language server's tests share: a client that drives the server
// over in-memory LSP streams, and helpers for positions in a document.
import {mkdir, symlink, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {PassThrough} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {startServer} from '../../packages/lit-language-server/src/server.js';

export interface Notification {
  method: string;
  params: any;
}

/** A minimal LSP client over in-memory streams. */
export const createClient = () => {
  const toServer = new PassThrough();
  const fromServer = new PassThrough();
  startServer({input: toServer, output: fromServer});
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map<number, (result: unknown) => void>();
  const notifications: Notification[] = [];
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
    async waitFor(match: (n: Notification) => boolean) {
      for (;;) {
        const found = notifications.find(match);
        if (found) return found;
        await new Promise<void>((wake) => waiters.push(wake));
      }
    },
  };
};

/** The range of the `nth` `needle` in `code`, as LSP positions. */
export const rangeOf = (code: string, needle: string, nth = 0) => {
  let offset = -1;
  for (let i = 0; i <= nth; i++) offset = code.indexOf(needle, offset + 1);
  const position = (at: number) => {
    const lines = code.slice(0, at).split('\n');
    return {line: lines.length - 1, character: lines.at(-1)!.length};
  };
  return {start: position(offset), end: position(offset + needle.length)};
};

/** Writes each of `files`, by its path relative to `root`. */
export const writeFiles = async (
  root: string,
  files: Record<string, string>
): Promise<void> => {
  for (const [file, code] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), {recursive: true});
    await writeFile(join(root, file), code);
  }
};

/** Links the repo's copies of `deps` into `root`'s `node_modules`. */
export const linkRepoDeps = async (
  root: string,
  deps: readonly string[]
): Promise<void> => {
  const repo = fileURLToPath(new URL('../..', import.meta.url));
  await mkdir(join(root, 'node_modules'), {recursive: true});
  for (const dep of deps) {
    await symlink(
      join(repo, 'node_modules', dep),
      join(root, 'node_modules', dep)
    );
  }
};

/** The position of `‸` in `text`, and the text without it. */
export const at = (text: string) => {
  const before = text.slice(0, text.indexOf('‸')).split('\n');
  return {
    text: text.replace('‸', ''),
    position: {line: before.length - 1, character: before.at(-1)!.length},
  };
};
