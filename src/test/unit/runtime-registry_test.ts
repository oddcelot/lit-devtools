import {afterEach, beforeEach, expect, test, vi} from 'vite-plus/test';
import {
  joinPage,
  onRuntimeJoined,
  runtimesOnPage,
  yieldsToAnotherRuntime,
} from '../../lib/runtime/runtime-registry.js';

const KEY = Symbol.for('@oddsquad/vite-plugin-lit#runtimes');
const g = globalThis as unknown as Record<symbol, unknown>;
/** What a Vite-served module passes: its `import.meta.hot`. */
const HOT = {};

let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete g[KEY];
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  info.mockRestore();
  delete g[KEY];
});

test('one runtime joining many times is one runtime, and quiet', () => {
  // Every module of the Vite-served runtime joins, some of them twice.
  joinPage('vite');
  joinPage('vite');
  expect(runtimesOnPage()).toEqual(['vite']);
  expect(yieldsToAnotherRuntime(HOT)).toBe(false);
  expect(info).not.toHaveBeenCalled();
});

test('the Vite-served runtime yields to one that joined first', () => {
  // Asked before it joins, too: `persist` runs ahead of every other module.
  expect(yieldsToAnotherRuntime(HOT)).toBe(false);
  joinPage('extension');
  expect(yieldsToAnotherRuntime(HOT)).toBe(true);
  joinPage('vite');
  expect(yieldsToAnotherRuntime(HOT)).toBe(true);
  // The extension's own copies have no `hot` and always install.
  expect(yieldsToAnotherRuntime(undefined)).toBe(false);
});

test('a second runtime is noted once, naming who serves the page', () => {
  joinPage('extension');
  joinPage('vite');
  joinPage('standalone');
  expect(runtimesOnPage()).toEqual(['extension', 'vite', 'standalone']);
  expect(info).toHaveBeenCalledOnce();
  expect(String(info.mock.calls[0]![0])).toBe(
    "[lit-plugin] The Lit Inspector extension already serves this page, so the dev server's plugin shares its runtime instead of loading a second one."
  );
});

test('every listener hears a runtime join, even after one throws', () => {
  const heard: string[] = [];
  onRuntimeJoined(() => {
    throw new Error('boom');
  });
  onRuntimeJoined(() => heard.push(runtimesOnPage().join()));
  joinPage('extension');
  joinPage('extension');
  joinPage('vite');
  expect(heard).toEqual(['extension', 'extension,vite']);
});

test('copies of the module share the page registry', async () => {
  joinPage('extension');
  vi.resetModules();
  const copy = await import('../../lib/runtime/runtime-registry.js');
  copy.joinPage('vite');
  expect(runtimesOnPage()).toEqual(['extension', 'vite']);
});
