import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';

/** One task: a checkbox and its label, rendered inside `<task-list>`. */
@customElement('task-item')
export class TaskItem extends LitElement {
  static override styles = css`
    label {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-md);
      background: var(--surface-container-high);
      cursor: pointer;
    }
    input {
      accent-color: var(--accent);
    }
    :host([done]) span {
      color: var(--text-muted);
      text-decoration: line-through;
    }
  `;

  @property() label = '';
  @property({type: Boolean, reflect: true}) done = false;

  #toggle(event: Event) {
    this.done = (event.target as HTMLInputElement).checked;
    this.dispatchEvent(
      new CustomEvent('task-toggle', {detail: this.done, bubbles: true})
    );
  }

  override render() {
    return html`
      <label>
        <!-- ?checked, not .checked: @lit-labs/ssr writes a property
             binding as an attribute, and checked="false" is ticked. -->
        <input type="checkbox" ?checked=${this.done} @change=${this.#toggle} />
        <span>${this.label}</span>
      </label>
    `;
  }
}
