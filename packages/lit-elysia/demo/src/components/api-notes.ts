import {LitElement, css, html, nothing} from 'lit';
import {api} from '@oddsquad/lit-elysia/eden';
import {invalidate} from '@oddsquad/lit-elysia/routes';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';

/**
 * Talks to the app's JSON API through the typed Eden client: the routes,
 * bodies and responses are checked against src/server.ts.
 */
export class ApiNotes extends LitElement {
  static override properties = {
    titles: {state: true},
    problem: {state: true},
  };
  // Web Awesome's utility classes are page CSS, which stops at the shadow root.
  static override styles = css`
    :host {
      display: block;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--wa-space-s);
    }
    wa-callout {
      margin-top: var(--wa-space-m);
    }
  `;

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

  /**
   * Posts a title the API already has. Its 409 is typed: narrowed by its
   * status, `error.value` has the body the route returned, `existing` too.
   */
  async addTaken() {
    const {error} = await api.api.notes.post({
      title: 'Elysia',
      body: 'A second note by a title that is taken.',
    });
    if (error?.status === 409) {
      this.problem = `409: ${error.value.message} It is note ${error.value.existing}.`;
    } else if (error) {
      this.problem = `The API said ${String(error.status)}`;
    }
  }

  /** Asks for a note by id: the 404 has a message of its own. */
  async lookUp(id: number) {
    const {data, error} = await api.api.notes({id}).get();
    if (error?.status === 404) {
      this.problem = `404: ${error.value.message}`;
      return;
    }
    this.problem = error ? `The API said ${String(error.status)}` : undefined;
    this.titles = data ? [data.title] : undefined;
  }

  override render() {
    return html`
      <div class="actions">
        <wa-button id="list" @click=${() => this.list()}>List notes</wa-button>
        <wa-button id="add" variant="brand" @click=${() => this.add()}>
          Add one through the API
        </wa-button>
        <wa-button id="add-taken" @click=${() => this.addTaken()}>
          Add “Elysia” again
        </wa-button>
        <wa-button id="look-up" @click=${() => this.lookUp(99)}>
          Look up note 99
        </wa-button>
      </div>
      ${
        this.problem
          ? html`<wa-callout variant="warning" role="alert"
              >${this.problem}</wa-callout
            >`
          : nothing
      }
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
