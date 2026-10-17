import {afterEach, beforeEach, expect, test, vi} from 'vite-plus/test';
import {
  joinPage,
  onRuntimeJoined,
  runtimesOnPage,
} from '../../lib/runtime/runtime-registry.js';

const KEY = Symbol.for('@oddsquad/vite-plugin-lit#runtimes');
const g = globalThis as unknown as Record<symbol, unknown>;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  delete g[KEY];
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  delete g[KEY];
});

test('one runtime joining many times is one runtime, and quiet', () => {
  // Every module of the Vite-served runtime joins, some of them twice.
  joinPage('vite');
  joinPage('vite');
  expect(runtimesOnPage()).toEqual(['vite']);
  expect(warn).not.toHaveBeenCalled();
});

test('a second runtime is warned about once, naming both', () => {
  joinPage('extension');
  joinPage('vite');
  joinPage('standalone');
  expect(runtimesOnPage()).toEqual(['extension', 'vite', 'standalone']);
  expect(warn).toHaveBeenCalledOnce();
  expect(String(warn.mock.calls[0]![0])).toContain(
    "the Lit Inspector extension and the dev server's plugin"
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
