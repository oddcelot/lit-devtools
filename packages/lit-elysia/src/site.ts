import {render, type TemplateResult} from 'lit';
import {compose, headOf, titleOf, type View} from './compose.ts';
import type {Layout, Page} from './page.ts';
import {HEAD_END, HEAD_START, type Payload} from './shared.ts';

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
  replaceHead(headOf(view, payload));
};

/**
 * Swaps the page's `<head>` tags, between the markers the server wrote, for
 * the ones `templates` render.
 */
const replaceHead = (templates: TemplateResult[]) => {
  const [start, end] = headMarkers();
  while (start.nextSibling && start.nextSibling !== end) {
    start.nextSibling.remove();
  }
  for (const template of templates) {
    // One container each: Lit keeps what it rendered on the container.
    const scratch = document.createElement('div');
    render(template, scratch);
    end.before(...Array.from(scratch.children));
  }
};

/** The markers around the pages' tags, added when the shell has none. */
const headMarkers = (): [Comment, Comment] => {
  const comments = Array.from(document.head.childNodes).filter(
    (node): node is Comment => node.nodeType === Node.COMMENT_NODE
  );
  const start = comments.find((node) => node.data === HEAD_START);
  const end = comments.find((node) => node.data === HEAD_END);
  if (start && end) return [start, end];
  const pair: [Comment, Comment] = [
    document.createComment(HEAD_START),
    document.createComment(HEAD_END),
  ];
  document.head.append(...pair);
  return pair;
};

/** For hydration, which renders the first page itself. */
export const remember = (payload: Payload): void => {
  shown = payload;
};

/**
 * The route a path answers, as the server's router would pick it: static
 * segments over params, params over a catch-all.
 */
export const matchRoute = (
  site: Site,
  pathname: string
): string | undefined => {
  const parts = pathname.split('/').filter(Boolean);
  return Object.keys(site.routes)
    .map((route) => ({route, score: scoreOf(route, parts)}))
    .filter(({score}) => score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.route;
};

/** How well a route fits: negative for not at all, more for static parts. */
const scoreOf = (route: string, parts: string[]) => {
  if (!route.startsWith('/')) return -1;
  const {fixed, rest} = shapeOf(route);
  if (!fits(fixed.length, parts.length, rest)) return -1;
  // An exact fit outranks a catch-all with the same segments.
  const exact = rest ? 0 : 1;
  return fixed.reduce(
    (sum, segment, i) => sum + segmentScore(segment, parts[i]!),
    exact
  );
};

/** A route's segments before any catch-all, and whether it has one. */
const shapeOf = (route: string) => {
  const segments = route.split('/').filter(Boolean);
  const rest = segments.at(-1) === '*';
  return {fixed: rest ? segments.slice(0, -1) : segments, rest};
};

const fits = (fixed: number, parts: number, rest: boolean) =>
  rest ? parts >= fixed : parts === fixed;

const segmentScore = (segment: string, part: string) => {
  if (segment.startsWith(':')) return 1;
  return segment === part ? 2 : -Infinity;
};
