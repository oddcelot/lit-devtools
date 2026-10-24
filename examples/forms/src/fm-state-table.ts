import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {FormControl} from './form-control';

const STATES = [
  'touched',
  'dirty',
  'user-invalid',
  'empty',
  'checked',
  'rated',
  'full',
];

// Anything that can move a state. `invalid` doesn't bubble, so these are
// listened for in the capture phase.
const EVENTS = ['input', 'change', 'focusout', 'reset', 'invalid'];

/**
 * A table of each control's custom states in the form named by `for`, read
 * with `matches(':state(…)')`. It listens to the form itself and redraws
 * only itself, so the page around it doesn't re-render while someone types.
 */
@customElement('fm-state-table')
export class FmStateTable extends LitElement {
  static override styles = css`
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125em;
    }
    th,
    td {
      padding: 4px 6px;
      border-bottom: 1px solid #dedbe9;
      text-align: center;
    }
    th:first-child,
    td:first-child {
      text-align: left;
    }
    td.on {
      color: var(--fm-accent, #5b4bdb);
      font-weight: 700;
    }
  `;

  /** The `id` of the form, in the same root as the table. */
  @property() for = '';

  #form?: HTMLFormElement;
  #frame = 0;

  override connectedCallback() {
    super.connectedCallback();
    const root = this.getRootNode() as Document | ShadowRoot;
    const form = root.getElementById(this.for);
    if (form instanceof HTMLFormElement) {
      this.#form = form;
      for (const type of EVENTS) {
        form.addEventListener(type, this.#refresh, true);
      }
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    for (const type of EVENTS) {
      this.#form?.removeEventListener(type, this.#refresh, true);
    }
    this.#form = undefined;
  }

  // The controls set their states when they update, after the event, and
  // a reset lands after its event too. Read them a frame later, once for
  // a burst of events (a failed submit fires `invalid` at every control).
  #refresh = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.requestUpdate());
  };

  override render() {
    const controls = [...(this.#form?.elements ?? [])].filter(
      (el): el is FormControl<unknown> => el instanceof FormControl
    );
    return html`
      <table>
        <tr>
          <th>name</th>
          ${STATES.map((s) => html`<th>${s}</th>`)}
          <th>:invalid</th>
        </tr>
        ${controls.map(
          (control) => html`
            <tr>
              <td><code>${control.name}</code></td>
              ${STATES.map((s) => this.#cell(control.matches(`:state(${s})`)))}
              ${this.#cell(control.matches(':invalid'))}
            </tr>
          `
        )}
      </table>
    `;
  }

  #cell(on: boolean) {
    return html`<td class=${on ? 'on' : ''}>${on ? '●' : '·'}</td>`;
  }

  // The controls' states are first set after their own first update.
  override firstUpdated() {
    this.#refresh();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-state-table': FmStateTable;
  }
}
