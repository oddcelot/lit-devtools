import {afterEach, expect, test, vi} from 'vite-plus/test';

const connect = vi.hoisted(() =>
  vi.fn(() => ({status: 'connected', emit: () => {}}))
);
vi.mock('devframe/in-page-channel', () => ({connectPanelChannel: connect}));

afterEach(() => {
  vi.resetModules();
  connect.mockClear();
  vi.unstubAllGlobals();
});

const load = () => import('../../panel/in-page.js');

test('a panel with no page in reach never opens the channel', async () => {
  const {inPageConnected} = await load();
  expect(window.parent).toBe(window);
  expect(inPageConnected()).toBe(false);
  expect(connect).not.toHaveBeenCalled();
});

test('a panel opened by the page connects to it', async () => {
  vi.stubGlobal('opener', {});
  const {inPageConnected} = await load();
  expect(inPageConnected()).toBe(true);
  expect(connect).toHaveBeenCalledOnce();
});

test('a panel with a local client never opens the channel, even when framed', async () => {
  vi.stubGlobal('opener', {});
  const {useLocalClient} = await import('../../panel/client.js');
  useLocalClient({scope: () => ({}) as never});
  const {inPageConnected} = await load();
  expect(inPageConnected()).toBe(false);
  expect(connect).not.toHaveBeenCalled();
});
