/** Fired on `window` when the router starts waiting on the server. */
export const NAVIGATING = 'lit-elysia:navigating';
/** Fired on `window` when it has rendered, or given up. */
export const NAVIGATED = 'lit-elysia:navigated';

let waiting = 0;

/**
 * Marks the page busy while `work` runs: `data-navigating` and `aria-busy`
 * on `<html>`, for a stylesheet to show progress and for assistive tech,
 * and an event at each end, for anything else. On `<html>` rather than the
 * outlet: Pico and Blades restyle any other element marked busy (a spinner,
 * `white-space: nowrap`), which reflowed the whole page for a moment. Back-to-back steps of one navigation, the
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
  document.documentElement.setAttribute('aria-busy', 'true');
  dispatchEvent(new Event(NAVIGATING));
};

const finish = () => {
  if (!busy) return;
  busy = false;
  document.documentElement.removeAttribute('data-navigating');
  document.documentElement.removeAttribute('aria-busy');
  dispatchEvent(new Event(NAVIGATED));
};
