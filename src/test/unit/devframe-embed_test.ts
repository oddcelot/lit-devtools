import {afterEach, describe, expect, test} from 'vite-plus/test';
import {createLitDevtools, type LitDevtools} from '../../lib/devframe/embed.js';

const open: LitDevtools[] = [];
const create = (...args: Parameters<typeof createLitDevtools>) => {
  const devtools = createLitDevtools(...args);
  open.push(devtools);
  return devtools;
};

afterEach(async () => {
  await Promise.all(open.splice(0).map((devtools) => devtools.close()));
});

const get = (devtools: LitDevtools, path: string) =>
  devtools.handler(new Request(`http://localhost:3000${path}`));

describe('createLitDevtools', () => {
  test('answers under /__lit-devtools/ by default', () => {
    const devtools = create({auth: false});
    expect(devtools.base).toBe('/__lit-devtools/');
    expect(devtools.script).toBe('/__lit-devtools/lit-devtools.js');
  });

  test('normalizes a custom base', () => {
    const devtools = create({base: '/tools', auth: false});
    expect(devtools.base).toBe('/tools/');
    expect(devtools.script).toBe('/tools/lit-devtools.js');
  });

  test('advertises a side-car WebSocket, which no connection limit counts', async () => {
    const devtools = create({auth: false});
    const response = await get(devtools, '/__lit-devtools/__connection.json');
    const meta = (await response.json()) as {
      backend: string;
      websocket?: {port?: number};
    };
    expect(meta.backend).toBe('websocket');
    expect(meta.websocket?.port).toBeGreaterThan(0);
  });

  test('keeps everything on the host’s origin with transport: sse', async () => {
    const devtools = create({auth: false, transport: 'sse'});
    const response = await get(devtools, '/__lit-devtools/__connection.json');
    const meta = (await response.json()) as {backend: string};
    expect(meta.backend).toBe('sse');
  });

  test('serves the page script with its server and descriptor', async () => {
    const devtools = create({auth: false});
    const response = await get(devtools, devtools.script);
    expect(response.headers.get('content-type')).toContain('javascript');
    const body = await response.text();
    const config = JSON.parse(
      /^globalThis\.__LIT_DEVTOOLS_CONNECT__ = (.*);$/m.exec(body)![1]!
    ) as {url: string; connectionMeta: {backend: string}};
    expect(config.url).toBe('http://localhost:3000/__lit-devtools/');
    expect(config.connectionMeta.backend).toBe('websocket');
  });

  test('docks the panel in the page unless told not to', async () => {
    const dockOf = async (devtools: LitDevtools) => {
      const body = await (await get(devtools, devtools.script)).text();
      return (
        JSON.parse(
          /^globalThis\.__LIT_DEVTOOLS_CONNECT__ = (.*);$/m.exec(body)![1]!
        ) as {dock: boolean}
      ).dock;
    };
    expect(await dockOf(create({auth: false}))).toBe(true);
    expect(await dockOf(create({auth: false, dock: false}))).toBe(false);
  });

  test('serves the panel at the base', async () => {
    const devtools = create({auth: false});
    const response = await get(devtools, '/__lit-devtools/');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<!doctype html>');
  });

  test('leaves paths outside the base alone', async () => {
    const devtools = create({auth: false});
    expect((await get(devtools, '/somewhere-else')).status).toBe(404);
  });
});
