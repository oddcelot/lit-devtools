import {beforeEach, expect, test, vi} from 'vite-plus/test';

// A dev server that trusts at once and records what the page fires at it.
const fired: unknown[][] = [];
vi.mock('devframe/client', () => ({
  getDevframeRpcClient: async () => ({
    ensureTrusted: async () => {},
    close: () => {},
    scope: () => ({
      rpc: {
        callEvent: (...args: unknown[]) => void fired.push(args),
        register: () => {},
      },
    }),
  }),
}));

const g = globalThis as unknown as Record<symbol, unknown>;

beforeEach(() => {
  fired.length = 0;
  vi.resetModules();
  delete g[Symbol.for('@oddsquad/vite-plugin-lit#page-channel')];
  delete g[Symbol.for('@oddsquad/vite-plugin-lit#runtimes')];
});

test('connectToDevServer takes the channel over and hands it back', async () => {
  const {pageChannel} = await import('../../lib/runtime/page-channel.js');
  const {connectToDevServer} =
    await import('../../lib/runtime/rpc-transport.js');
  const viteSent: string[] = [];
  pageChannel.useViteHot({send: (e) => void viteSent.push(e), on: () => {}});
  const [vite] = pageChannel.carriers;

  const disconnect = await connectToDevServer('http://localhost:5180/');
  pageChannel.send('lit:x', 1);
  // The page's traffic goes to that server instead of its own Vite socket.
  expect(viteSent).toEqual([]);
  expect(fired).toEqual([['page-send', 'lit:x', 1]]);
  expect(pageChannel.carriers).not.toContain(vite);

  disconnect();
  pageChannel.send('lit:y');
  expect(viteSent).toEqual(['lit:y']);
  expect(pageChannel.carriers).toEqual([vite]);
});
