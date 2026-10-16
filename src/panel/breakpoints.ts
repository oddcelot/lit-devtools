/**
 * Breakpoints in the page, where the host can set them: pause in the
 * debugger when the selected element enters `update()` or `render()`, or a
 * reactive property of it changes.
 *
 * Only the Lit Inspector extension can. It runs inside the browser's
 * DevTools, so the debugger is open to stop at the page's `debugger`
 * statement, and `inspectedWindow.eval` reaches the page runtime's
 * {@link PageBreakpoints}. It registers with {@link useBreakpoints} before the
 * panel mounts; the other hosts have no debugger attached to the page, so a
 * breakpoint there would silently never pause. A seam of the panel, like
 * `element-revealer.ts`, for the same reason: only the page holding
 * `chrome.devtools` can tell.
 */

import type {BreakTarget, PageBreakpoints} from '../types/inspector.js';

/** {@link PageBreakpoints}, from the panel's side of the eval. */
export interface Breakpoints {
  set: (
    ...args: Parameters<PageBreakpoints['set']>
  ) => Promise<boolean> | boolean;
  clear: () => Promise<void> | void;
}

let current: Breakpoints | undefined;

/** Sets the host's breakpoints; `undefined` removes them. Call before mounting. */
export const useBreakpoints = (bp: Breakpoints | undefined): void => {
  current = bp;
};

/** The host's breakpoints, when it gave any. */
export const breakpoints = (): Breakpoints | undefined => current;

/** One key per target, for a set of the armed ones. */
export const breakKey = (target: BreakTarget): string =>
  `${target.kind}:${target.name}`;
