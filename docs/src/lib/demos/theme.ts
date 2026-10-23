/**
 * The light/dark choice the visitor made on the site, applied to the page
 * that runs this. Starlight keeps it in localStorage under
 * `starlight-theme` ('light', 'dark', or '' for the system's), and the
 * landing page writes the same key, so a choice made on either carries to
 * the other and into the demo frames. A frame hears a change through the
 * `storage` event, which fires in every other same-origin document.
 */
const KEY = 'starlight-theme';

const resolve = (): 'light' | 'dark' => {
  const stored =
    typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

const applyTheme = (): void => {
  const theme = resolve();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

export const followTheme = (): void => {
  applyTheme();
  addEventListener('storage', (event) => {
    if (event.key === KEY) applyTheme();
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener(
    'change',
    applyTheme
  );
};
