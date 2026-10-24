/**
 * The Components details sections the user folded, by label, remembered in
 * localStorage. Its own module so a page can fold sections before the panel
 * loads (`figures/live/panel-page.ts`).
 */

/** localStorage key listing the details sections the user folded. */
const COLLAPSED_LS_KEY = 'lit-devtools-components-collapsed';

export const readCollapsed = (): ReadonlySet<string> => {
  try {
    const list: unknown = JSON.parse(
      localStorage.getItem(COLLAPSED_LS_KEY) ?? '[]'
    );
    return new Set(
      Array.isArray(list)
        ? list.filter((x): x is string => typeof x === 'string')
        : []
    );
  } catch {
    return new Set();
  }
};

export const writeCollapsed = (labels: ReadonlySet<string>): void => {
  try {
    localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify([...labels]));
  } catch {
    // Storage unavailable: the fold just won't be remembered.
  }
};
