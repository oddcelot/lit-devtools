import {setInvalidator} from './links.ts';
import {fetchPage, markChanged} from './fetch-page.ts';
import {show, shownPage, viewOf, type Site} from './site.ts';

/**
 * Makes `invalidate` work on this page: it marks data changed, then loads
 * the page on screen again, in place and past the cache, when it depends
 * on the key. The same templates with new data: Lit updates only what
 * changed, and the elements on the page keep their state.
 */
export const enableInvalidate = (site: Site, outlet: HTMLElement): void => {
  let pending: AbortController | undefined;
  setInvalidator(async (key) => {
    markChanged();
    if (!dependsOn(key)) return;
    pending?.abort();
    pending = new AbortController();
    await reload(site, outlet, pending.signal);
  });
};

/** Whether the page on screen loads again for `key`; for none, always. */
const dependsOn = (key: string | undefined) => {
  const shown = shownPage();
  return Boolean(shown && (key === undefined || shown.depends?.includes(key)));
};

const reload = async (site: Site, outlet: HTMLElement, signal: AbortSignal) => {
  const fetched = await fetchPage(location.href, signal, {cache: 'no-cache'});
  if (signal.aborted) return;
  if (!fetched) return location.reload();
  show(outlet, await viewOf(site, fetched.page.route), fetched.page);
};
