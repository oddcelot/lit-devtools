import {LitElement, html, nothing} from 'lit';
import {api} from '@oddsquad/lit-elysia/eden';
import {invalidate} from '@oddsquad/lit-elysia/routes';
import buttons from './button.css?css-sheet';

/**
 * Talks to the app's JSON API through the typed Eden client: the routes,
 * bodies and responses are checked against src/server.ts.
 */
export class ApiNotes extends LitElement {
  static override properties = {
    titles: {state: true},
    problem: {state: true},
  };
  static override styles = [buttons];

  titles?: string[];
  problem?: string;

  async list() {
    const {data, error} = await api.api.notes.get();
    this.problem = error ? `The API said ${String(error.status)}` : undefined;
    this.titles = data?.map((note) => note.title);
  }

  async add() {
    const {error} = await api.api.notes.post({
      title: `From Eden ${new Date().toISOString().slice(11, 19)}`,
      body: 'Posted by a component.',
    });
    this.problem = error ? `The API said ${String(error.status)}` : undefined;
    await this.list();
    // The pages' data changed too: load the page on screen again.
    await invalidate();
  }

  override render() {
    return html`
      <button id="list" @click=${() => this.list()}>List notes</button>
      <button id="add" class="secondary" @click=${() => this.add()}>
        Add one through the API
      </button>
      ${this.problem ? html`<p role="alert">${this.problem}</p>` : nothing}
      ${
        this.titles
          ? html`<ol id="api-titles">
              ${this.titles.map((title) => html`<li>${title}</li>`)}
            </ol>`
          : nothing
      }
    `;
  }
}
customElements.define('api-notes', ApiNotes);

declare global {
  interface HTMLElementTagNameMap {
    'api-notes': ApiNotes;
  }
}
