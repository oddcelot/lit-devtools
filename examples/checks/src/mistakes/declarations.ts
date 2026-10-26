// Mistakes in a component's own declaration, reported in its file.
import {LitElement, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';

// invalid-name: `checks_declarations` needs a hyphen, so
// `customElements.define` throws.
@customElement('checks_declarations')
export class NoHyphen extends LitElement {}

// missing-element-type: `checks-untyped` isn't in `HTMLElementTagNameMap`,
// so TypeScript can't tell what `document.createElement('checks-untyped')`
// returns, and `npm run check` can't check its bindings. The quick fix, or
// `oxlint --fix`, writes the `declare global` block.
@customElement('checks-untyped')
export class Untyped extends LitElement {
  // invalid-name: HTML lowercases attribute names, so `maxValue` never sets
  // the property.
  // property-type: `max` is a number, but without `type: Number` Lit reads
  // its attribute as a string.
  @property({attribute: 'maxValue'}) max = 10;

  // shadowed-member: `after` replaces `Element.after()` on the element.
  @state() protected after = false;

  // property-visibility: `@state()` is internal, but `open` is public.
  @state() open = false;

  // property-visibility: `@property()` is public, but `secret` is private.
  @property() private secret = '';

  render() {
    return html`${this.max} ${this.after} ${this.open} ${this.secret}`;
  }
}
