import {type CSSResult, css, unsafeCSS} from 'lit';

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

/**
 * The disabled look of a form field whose box is `box` in its shadow root.
 * WA only halves a disabled field's opacity, which leaves it looking like an
 * empty one showing its placeholder. A muted fill, a dashed outline and the
 * not-allowed cursor tell the two apart at a glance, on top of WA's opacity.
 */
export const disabledField = (box: string): CSSResult => {
  const selector = unsafeCSS(`:host([disabled]) ${box}`);
  return css`
    :host([disabled]) {
      cursor: not-allowed;
    }
    ${selector} {
      background-color: var(--wa-color-neutral-fill-quiet);
      border-style: dashed;
      cursor: not-allowed;
      opacity: 0.5;
    }
  `;
};
