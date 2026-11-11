import {html, type TemplateResult} from 'lit';
import type {Layout, Page} from './page.ts';
import type {Payload} from './shared.ts';

/** A page with the layouts around it, outermost first. */
export interface View {
  page: Page<unknown>;
  layouts: Layout<unknown>[];
}

/**
 * A page that isn't hydrated, as its layouts render it: a marker the
 * server writes the page after, and hydration finds nothing to adopt in.
 * A literal: Lit takes no bindings in a comment. It reads `PAGE_START`.
 */
const unhydrated = html`<!--lit-elysia-page-->`;

/**
 * The page's template inside its layouts', each with its own data: the
 * same on the server, in hydration and after a navigation.
 */
export const compose = (
  {page, layouts}: View,
  payload: Payload
): TemplateResult =>
  layouts.reduceRight(
    (content, layout, i) => layout.render(content, payload.layouts[i]),
    payload.hydrate === false
      ? unhydrated
      : page.render(payload.data, payload.form)
  );

/** The page's title, or else the innermost layout's that has one. */
export const titleOf = (
  {page, layouts}: View,
  payload: Payload
): string | undefined => {
  if (page.title) return page.title(payload.data);
  const i = layouts.findLastIndex((layout) => layout.title);
  return i < 0 ? undefined : layouts[i]!.title!(payload.layouts[i]);
};

/** The `<head>` tags of the layouts, outermost first, then the page's. */
export const headOf = (
  {page, layouts}: View,
  payload: Payload
): TemplateResult[] => [
  ...layouts.flatMap((layout, i) =>
    layout.head ? [layout.head(payload.layouts[i])] : []
  ),
  ...(page.head ? [page.head(payload.data)] : []),
];
