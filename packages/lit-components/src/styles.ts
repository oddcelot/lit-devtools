import type {CSSResult} from 'lit';

/**
 * A Web Awesome class's `css` (the styles WA builds a component's shadow
 * root from) with more rules after it.
 *
 * WA's styles name `wa-icon` in places (a slotted icon in a button label, an
 * input's start slot), which a `lit-icon` doesn't match; the leaves add the
 * same rules for it here.
 */
export const extendCss = (
  base: readonly CSSResult[] | undefined,
  ...more: CSSResult[]
): CSSResult[] => [...(base ?? []), ...more];
