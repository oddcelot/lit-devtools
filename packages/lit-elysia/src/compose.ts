import type {TemplateResult} from 'lit';
import type {Layout, Page} from './page.ts';
import type {Payload} from './shared.ts';

/** A page with the layouts around it, outermost first. */
export interface View {
  page: Page<unknown>;
  layouts: Layout<unknown>[];
}

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
    page.render(payload.data)
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
