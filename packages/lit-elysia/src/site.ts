import {render} from 'lit';
import {compose, titleOf, type View} from './compose.ts';
import type {Layout, Page} from './page.ts';
import type {Payload} from './shared.ts';

/** The pages and layouts as the generated client entry hands them over. */
export interface Site {
  /** Every page and layout module, by file. */
  files: Record<string, () => Promise<{default: unknown}>>;
  /** Each route's page file and its layout files, outermost first. */
  routes: Record<string, {page: string; layouts: string[]}>;
}

/** The page in the outlet and the data it rendered with. */
let shown: Payload | undefined;

export const shownPage = (): Payload | undefined => shown;

/** The page and layout modules a route renders with. */
export const viewOf = async (site: Site, route: string): Promise<View> => {
  const files = site.routes[route];
  if (!files) throw new Error(`[lit-elysia] no page for route ${route}`);
  const load = async (file: string) => (await site.files[file]!()).default;
  return {
    page: (await load(files.page)) as Page<unknown>,
    layouts: (await Promise.all(files.layouts.map(load))) as Layout<unknown>[],
  };
};

/** Whether a route renders with `file`, as its page or one of its layouts. */
export const usesFile = (site: Site, route: string, file: string): boolean => {
  const files = site.routes[route];
  return files?.page === file || (files?.layouts.includes(file) ?? false);
};

/**
 * Renders a page into the outlet. Lit compares the new template with the
 * one there: under the same layouts only the page's part changes.
 */
export const show = (
  outlet: HTMLElement,
  view: View,
  payload: Payload
): void => {
  render(compose(view, payload), outlet);
  shown = payload;
  const title = titleOf(view, payload);
  if (title !== undefined) document.title = title;
};

/** For hydration, which renders the first page itself. */
export const remember = (payload: Payload): void => {
  shown = payload;
};
