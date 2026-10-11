import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';

interface Todo {
  title: string;
  done: boolean;
  priority: number;
}

/**
 * Objects, arrays, a Map and a Set, all rendered, so a leaf edited from the
 * Components tab shows up on the page. Members of a `Set` have no slot to
 * write to, so the DevTools leave them read-only.
 *
 * @example <caption>Drop it on a page</caption>
 * <hmr-complex-props></hmr-complex-props>
 */
@customElement('hmr-complex-props')
export class HmrComplexProps extends LitElement {
  static override styles = css`
    p,
    ul {
      margin: 0.25rem 0;
    }
    .swatch {
      display: inline-block;
      width: 1em;
      height: 1em;
      vertical-align: middle;
      border: 1px solid currentColor;
    }
    .done {
      text-decoration: line-through;
    }
  `;

  /** Numbers, a boolean, and an object one level further down. */
  @state()
  private settings = {
    volume: 7,
    muted: false,
    theme: {accent: 'tomato', radius: 4},
  };

  /** An array of objects. */
  @property({attribute: false})
  todos: Todo[] = [
    {title: 'Write the docs', done: false, priority: 2},
    {title: 'Ship it', done: true, priority: 1},
  ];

  /** Entry values are editable; the keys are not. */
  @state()
  private scores = new Map<string, number>([
    ['alice', 3],
    ['bob', 5],
  ]);

  /** Members have no slot to write to: read-only in the panel. */
  @state()
  private tags = new Set(['lit', 'devtools']);

  override render() {
    const {volume, muted, theme} = this.settings;
    return html`
      <h2>Complex props</h2>
      <p>
        settings: volume ${muted ? 'muted' : volume},
        <span
          class="swatch"
          style="background: ${theme.accent}; border-radius: ${theme.radius}px"
        ></span>
        ${theme.accent}, radius ${theme.radius}
      </p>
      <ul>
        ${this.todos.map(
          (t) =>
            html`<li class=${t.done ? 'done' : ''}>
              ${t.title} (priority ${t.priority})
            </li>`
        )}
      </ul>
      <p>
        scores:
        ${[...this.scores].map(([name, n]) => `${name} ${n}`).join(', ')}
      </p>
      <p>tags: ${[...this.tags].join(', ')}</p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hmr-complex-props': HmrComplexProps;
  }
}
