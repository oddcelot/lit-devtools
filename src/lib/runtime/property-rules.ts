/**
 * `@property` hoisting for the dev helpers' constructed sheets in `css.ts`.
 * A build writes the same hoisting into each sheet module that needs it
 * (`plugins/css-queries.ts`), so it never imports this file.
 *
 * @module
 */

/** `@property` rules in `rules`, including those nested in `@layer`/`@supports`. */
const propertyRules = (rules: CSSRuleList): string[] =>
  [...rules].flatMap((rule) =>
    rule instanceof CSSPropertyRule
      ? [rule.cssText]
      : 'cssRules' in rule
        ? propertyRules((rule as CSSGroupingRule).cssRules)
        : []
  );

/**
 * Keeps a copy of `sheet`'s `@property` rules in a sheet adopted by the
 * document; call the returned function after every `replaceSync()`.
 *
 * Browsers ignore `@property` inside a shadow root, so a custom property the
 * sheet registers there keeps no initial value, and every declaration built
 * on it is invalid. Tailwind v4's shadow, ring, transform and gradient
 * utilities all read properties registered that way. A registration in the
 * document applies in every shadow root, so the copy makes them work.
 */
export const hoistPropertyRules = (sheet: CSSStyleSheet): (() => void) => {
  if (
    typeof document === 'undefined' ||
    typeof CSSPropertyRule === 'undefined'
  ) {
    return () => {};
  }
  const hoisted = new CSSStyleSheet();
  let adopted = false;
  return () => {
    const rules = propertyRules(sheet.cssRules);
    hoisted.replaceSync(rules.join('\n'));
    if (!adopted && rules.length > 0) {
      adopted = true;
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, hoisted];
    }
  };
};
