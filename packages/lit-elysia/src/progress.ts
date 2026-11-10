import {OUTLET_ID} from './shared.ts';

/** Fired on `window` when the router starts waiting on the server. */
export const NAVIGATING = 'lit-elysia:navigating';
/** Fired on `window` when it has rendered, or given up. */
export const NAVIGATED = 'lit-elysia:navigated';

let waiting = 0;

/**
 * Marks the page busy while `work` runs: `data-navigating` on `<html>`, for
 * a stylesheet to show progress, `aria-busy` on the outlet, and an event at
 * each end, for anything else. Back-to-back steps of one navigation, the
 * fetch and then the page's modules, count as one wait.
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

let busy = false;

const start = () => {
  if (busy) return;
  busy = true;
  document.documentElement.setAttribute('data-navigating', '');
  document.getElementById(OUTLET_ID)?.setAttribute('aria-busy', 'true');
  dispatchEvent(new Event(NAVIGATING));
};

const finish = () => {
  if (!busy) return;
  busy = false;
  document.documentElement.removeAttribute('data-navigating');
  document.getElementById(OUTLET_ID)?.removeAttribute('aria-busy');
  dispatchEvent(new Event(NAVIGATED));
};
