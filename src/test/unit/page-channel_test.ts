import {describe, expect, test, vi} from 'vite-plus/test';

// The module keeps its channel on `globalThis`, so each test loads a fresh copy
// (after dropping that slot, and the runtime registry `useViteHot` joins) to
// get a channel with no listeners or carrier.
const freshChannel = async () => {
  vi.resetModules();
  const g = globalThis as unknown as Record<symbol, unknown>;
  delete g[Symbol.for('@oddsquad/vite-plugin-lit#page-channel')];
  delete g[Symbol.for('@oddsquad/vite-plugin-lit#runtimes')];
  return import('../../lib/runtime/page-channel.js');
};

// A carrier that records what it is asked to do and lets a test play the peer.
const fakeCarrier = () => {
  const sent: Array<[string, unknown]> = [];
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  return {
    sent,
    handlers,
    send: (channel: string, data?: unknown) => void sent.push([channel, data]),
    on(channel: string, handler: (data: unknown) => void) {
      const set = handlers.get(channel) ?? new Set();
      set.add(handler);
      handlers.set(channel, set);
      return () => void set.delete(handler);
    },
    deliver(channel: string, data: unknown) {
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
  };
};

describe('pageChannel', () => {
  test('drops sends until a carrier is attached', async () => {
    const {pageChannel} = await freshChannel();
    expect(pageChannel.attached).toBe(false);
    expect(() => pageChannel.send('a', 1)).not.toThrow();
  });

  test('binds listeners registered before the carrier existed', async () => {
    const {pageChannel} = await freshChannel();
    const seen: unknown[] = [];
    pageChannel.on('a', (d) => seen.push(d));
    const carrier = fakeCarrier();
    pageChannel.attach(carrier);
    carrier.deliver('a', 1);
    pageChannel.send('b', 2);
    expect(seen).toEqual([1]);
    expect(carrier.sent).toEqual([['b', 2]]);
  });

  test('serves every attached carrier: sends to each, hears each', async () => {
    const {pageChannel} = await freshChannel();
    const seen: unknown[] = [];
    // The extension's relay and the dev server's socket on one page.
    const first = fakeCarrier();
    pageChannel.attach(first);
    pageChannel.on('a', (d) => seen.push(d));
    const second = fakeCarrier();
    pageChannel.attach(second);
    first.deliver('a', 'from first');
    second.deliver('a', 'from second');
    expect(seen).toEqual(['from first', 'from second']);
    pageChannel.send('b');
    expect(first.sent).toEqual([['b', undefined]]);
    expect(second.sent).toEqual([['b', undefined]]);
    expect(pageChannel.carriers).toEqual([first, second]);
  });

  test('attaching a carrier again announces without binding twice', async () => {
    const {pageChannel} = await freshChannel();
    const seen: unknown[] = [];
    const announced: string[] = [];
    pageChannel.on('a', (d) => seen.push(d));
    pageChannel.onAttach(() => announced.push('ready'));
    const relay = fakeCarrier();
    pageChannel.attach(relay);
    // The extension's relay reconnecting re-attaches the same transport.
    pageChannel.attach(relay);
    relay.deliver('a', 1);
    pageChannel.send('b');
    expect(seen).toEqual([1]);
    expect(relay.sent).toEqual([['b', undefined]]);
    expect(announced).toEqual(['ready', 'ready']);
  });

  test('detach unbinds a carrier and leaves the others', async () => {
    const {pageChannel} = await freshChannel();
    const seen: unknown[] = [];
    const kept = fakeCarrier();
    const dropped = fakeCarrier();
    pageChannel.attach(kept);
    pageChannel.attach(dropped);
    pageChannel.on('a', (d) => seen.push(d));
    pageChannel.detach(dropped);
    dropped.deliver('a', 'stale');
    kept.deliver('a', 'live');
    pageChannel.send('b');
    expect(seen).toEqual(['live']);
    expect(dropped.sent).toEqual([]);
    expect(dropped.handlers.get('a')?.size).toBe(0);
    expect(pageChannel.carriers).toEqual([kept]);
  });

  test('a removed listener stays removed across a carrier swap', async () => {
    const {pageChannel} = await freshChannel();
    const seen: unknown[] = [];
    const off = pageChannel.on('a', (d) => seen.push(d));
    off();
    const carrier = fakeCarrier();
    pageChannel.attach(carrier);
    carrier.deliver('a', 1);
    expect(seen).toEqual([]);
  });

  test('onAttach runs for later attaches only, and survives a throwing callback', async () => {
    const {pageChannel} = await freshChannel();
    pageChannel.attach(fakeCarrier());
    const calls: string[] = [];
    pageChannel.onAttach(() => {
      throw new Error('boom');
    });
    pageChannel.onAttach(() => calls.push('second'));
    expect(calls).toEqual([]);
    pageChannel.attach(fakeCarrier());
    expect(calls).toEqual(['second']);
  });

  test('useViteHot joins beside a carrier that is already attached', async () => {
    const {pageChannel} = await freshChannel();
    const relay = fakeCarrier();
    pageChannel.attach(relay);
    const hotSent: string[] = [];
    pageChannel.useViteHot({
      send: (event) => void hotSent.push(event),
      on: () => {},
    });
    pageChannel.send('a');
    expect(hotSent).toEqual(['a']);
    expect(relay.sent).toEqual([['a', undefined]]);
  });

  test("useViteHot adds one carrier however many modules' hot it gets", async () => {
    const {pageChannel} = await freshChannel();
    const sent: string[] = [];
    // Each module has its own `import.meta.hot`, all on one socket.
    for (let i = 0; i < 3; i++) {
      pageChannel.useViteHot({
        send: (event) => void sent.push(`${i}:${event}`),
        on: () => {},
      });
    }
    pageChannel.send('a');
    expect(sent).toEqual(['0:a']);
  });

  test('useViteHot wraps the HMR client as the default carrier', async () => {
    const {pageChannel} = await freshChannel();
    const registered: Array<[string, (d: any) => void]> = [];
    const removed: string[] = [];
    const sent: Array<[string, unknown]> = [];
    pageChannel.useViteHot({
      send: (event, data) => void sent.push([event, data]),
      on: (event, cb) => void registered.push([event, cb]),
      off: (event) => void removed.push(event),
    });
    const seen: unknown[] = [];
    const off = pageChannel.on('lit:x', (d) => seen.push(d));
    registered[0][1]('hi');
    pageChannel.send('lit:y', {n: 1});
    off();
    expect(seen).toEqual(['hi']);
    expect(sent).toEqual([['lit:y', {n: 1}]]);
    expect(removed).toEqual(['lit:x']);
  });
});
