import {pendingOptions} from './pending.ts';

/** Fired on `window` when a navigation starts to count as pending. */
export const NAVIGATING = 'lit-elysia:navigating';
/** Fired on `window` when it no longer does. */
export const NAVIGATED = 'lit-elysia:navigated';

let waiting = 0;

/**
 * Marks the page busy while `work` runs: `data-navigating` and `aria-busy`
 * on `<html>`, for a stylesheet to show progress and for assistive tech,
 * and an event at each end, for anything else. On `<html>` rather than the
 * outlet: Pico and Blades restyle any other element marked busy (a spinner,
 * `white-space: nowrap`), which reflowed the whole page for a moment.
 *
 * Only once the wait has lasted `pendingMs`, and then for `pendingMinMs` at
 * least (see `configurePending`). Back-to-back steps of one navigation,
 * the fetch and then the page's modules, count as one wait.
 */
export const whileLoading = async <T>(work: () => Promise<T>): Promise<T> => {
  if (waiting++ === 0) start();
  try {
    return await work();
  } finally {
    waiting--;
    // A moment's grace, for the next step of the same navigation.
    setTimeout(() => waiting === 0 && finish());
  }
};

let shownAt: number | undefined;
let showing: ReturnType<typeof setTimeout> | undefined;
let hiding: ReturnType<typeof setTimeout> | undefined;

const start = () => {
  // Still shown from the last navigation: it carries on.
  clearTimeout(hiding);
  if (shownAt !== undefined || showing !== undefined) return;
  showing = setTimeout(show, pendingOptions().ms);
};

const finish = () => {
  clearTimeout(showing);
  showing = undefined;
  if (shownAt === undefined) return;
  const left = shownAt + pendingOptions().minMs - Date.now();
  hiding = setTimeout(hide, Math.max(0, left));
};

const show = () => {
  showing = undefined;
  shownAt = Date.now();
  document.documentElement.setAttribute('data-navigating', '');
  document.documentElement.setAttribute('aria-busy', 'true');
  dispatchEvent(new Event(NAVIGATING));
};

const hide = () => {
  shownAt = undefined;
  document.documentElement.removeAttribute('data-navigating');
  document.documentElement.removeAttribute('aria-busy');
  dispatchEvent(new Event(NAVIGATED));
};
