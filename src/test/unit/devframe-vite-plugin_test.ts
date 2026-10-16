import {beforeEach, describe, expect, test, vi} from 'vite-plus/test';

const initiate = vi.hoisted(() => ({
  closed: 0,
  calls: [] as Array<{base: string}>,
  middleware: vi.fn((_req: unknown, _res: unknown, next?: () => void) =>
    next?.()
  ),
}));
vi.mock('devframe/initiate', () => ({
  initDevframe: (_def: unknown, options: {base: string}) => {
    initiate.calls.push(options);
    return {
      ready: Promise.resolve(),
      nodeMiddleware: initiate.middleware,
      close: async () => void initiate.closed++,
    };
  },
}));

type Plugin = ReturnType<
  typeof import('../../lib/devframe/vite.js').createLitDevframePlugin
>;
type Middleware = (req: unknown, res: unknown, next: () => void) => void;

const load = async (enabled: () => boolean = () => true): Promise<Plugin> => {
  const {createLitDevframePlugin} = await import('../../lib/devframe/vite.js');
  return createLitDevframePlugin({version: '9.9.9', enabled});
};

/** A Vite server double: the middlewares the plugin adds, and its hooks. */
const fakeServer = () => {
  const used: Middleware[] = [];
  const info: string[] = [];
  const server = {
    middlewares: {use: (m: Middleware) => void used.push(m)},
    hot: {on() {}, off() {}, send() {}},
    httpServer: {once() {}},
    config: {root: '/project', logger: {info: (m: string) => info.push(m)}},
    resolvedUrls: {local: ['http://localhost:5173/'], network: []},
    printUrls: () => {},
    close: async () => {},
  };
  return {server, used, info};
};

const configure = async (plugin: Plugin, server: unknown): Promise<void> => {
  const hook = plugin.configureServer as unknown as (
    s: unknown
  ) => () => Promise<void>;
  await hook(server)();
};

const runSetup = (plugin: Plugin): Promise<void> =>
  (
    plugin.devtools as unknown as {setup: (ctx: unknown) => Promise<void>}
  ).setup({install: async () => {}});

describe('without a Vite DevTools hub', () => {
  beforeEach(() => {
    initiate.calls.length = 0;
    initiate.middleware.mockClear();
  });

  test('serves the panel at /__lit/ and prints its URL', async () => {
    const {server, used, info} = fakeServer();
    await configure(await load(), server);
    expect(initiate.calls).toMatchObject([{base: '/__lit/'}]);
    // The middleware added up front now hands requests to devframe.
    const next = vi.fn();
    used[0]!({}, {}, next);
    expect(initiate.middleware).toHaveBeenCalledOnce();
    server.printUrls();
    expect(info).toEqual(['  ➜  Lit DevTools: http://localhost:5173/__lit/']);
    // Closing the server closes the panel's sockets too.
    const before = initiate.closed;
    await server.close();
    expect(initiate.closed).toBe(before + 1);
  });

  test('leaves the panel to the hub when setup ran', async () => {
    const {server, used} = fakeServer();
    const plugin = await load();
    await runSetup(plugin);
    await configure(plugin, server);
    expect(initiate.calls).toEqual([]);
    const next = vi.fn();
    used[0]!({}, {}, next);
    expect(next).toHaveBeenCalledOnce();
    expect(initiate.middleware).not.toHaveBeenCalled();
  });

  test('serves nothing when the panel is disabled', async () => {
    const {server} = fakeServer();
    await configure(await load(() => false), server);
    expect(initiate.calls).toEqual([]);
  });
});
