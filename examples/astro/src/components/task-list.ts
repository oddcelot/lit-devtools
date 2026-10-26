import {LitElement, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import './task-item.ts';
import ui from './ui.css?css-sheet';

/**
 * Renders a `<task-item>` for each task. On the server both render as one:
 * the items' shadow roots sit inside this one's, held back until this
 * element hydrates and hands them their properties.
 */
@customElement('task-list')
export class TaskList extends LitElement {
  static override styles = [
    ui,
    css`
      ul {
        display: grid;
        gap: var(--space-3);
        margin: 0 0 var(--space-6);
        padding: 0;
        list-style: none;
      }
      footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
    `,
  ];

  @property({attribute: false}) tasks: string[] = [];

  @state() private done = 0;

  override render() {
    return html`
      <ul
        @task-toggle=${(e: CustomEvent<boolean>) => (this.done += e.detail ? 1 : -1)}
      >
        ${this.tasks.map(
          (task) => html`<li><task-item .label=${task}></task-item></li>`
        )}
      </ul>
      <footer>
        <span class="muted" id="done"
          >${this.done} of ${this.tasks.length} done</span
        >
        <button
          @click=${() => (this.tasks = [...this.tasks, `Task ${this.tasks.length + 1}`])}
        >
          Add a task
        </button>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'task-list': TaskList;
  }
}
