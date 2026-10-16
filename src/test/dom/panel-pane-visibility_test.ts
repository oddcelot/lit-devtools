import {afterEach, expect, test, vi} from 'vite-plus/test';
import {watchPaneVisibility} from '../../panel/pane-visibility.js';

// Plays the browser: `report` delivers an entry to the live observer.
const fakeObserver = () => {
  const state = {
    observed: [] as Element[],
    disconnected: false,
    report: (_intersecting: boolean) => {},
  };
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: (entries: Array<{isIntersecting: boolean}>) => void
      ) {
        state.report = (isIntersecting) => callback([{isIntersecting}]);
      }
      observe(el: Element) {
        state.observed.push(el);
      }
      disconnect() {
        state.disconnected = true;
      }
    }
  );
  return state;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test('reports the panel hidden and shown again, once per change', () => {
  const io = fakeObserver();
  const seen: boolean[] = [];
  watchPaneVisibility((visible) => seen.push(visible));
  expect(io.observed).toEqual([document.documentElement]);

  io.report(true);
  io.report(false);
  io.report(false);
  io.report(true);
  expect(seen).toEqual([true, false, true]);
});

test('stops watching when asked', () => {
  const io = fakeObserver();
  const stop = watchPaneVisibility(() => {});
  stop();
  expect(io.disconnected).toBe(true);
});

test('counts as always visible without IntersectionObserver', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const onChange = vi.fn();
  expect(() => watchPaneVisibility(onChange)()).not.toThrow();
  expect(onChange).not.toHaveBeenCalled();
});
