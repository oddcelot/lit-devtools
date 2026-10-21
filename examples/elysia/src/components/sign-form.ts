import {LitElement, css, html, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {api} from '../client/api.ts';
import {LIMITS} from '../shared.ts';

/**
 * The form that signs the book. It is a real `<form method="post">`, so it
 * works from the server's HTML alone: the page renders it with
 * `defer-hydration`, and until someone reaches for it the browser posts it
 * to `/sign` and follows the redirect. Once hydrated it posts through Eden
 * instead, and the new entry comes back over `/live`.
 */
@customElement('sign-form')
export class SignForm extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    form {
      display: grid;
      gap: 0.75rem;
      padding: 1.25rem;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 0.75rem;
      box-shadow: 0 1px 0 var(--line);
    }
    label {
      display: grid;
      gap: 0.25rem;
      font-size: 0.85rem;
      color: var(--muted);
    }
    input,
    textarea {
      font: inherit;
      color: var(--ink);
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: var(--paper);
      resize: vertical;
    }
    input:focus-visible,
    textarea:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    button {
      font: 600 0.95rem var(--sans);
      color: white;
      background: var(--accent);
      border: 0;
      border-radius: 0.5rem;
      padding: 0.6rem 1.1rem;
      cursor: pointer;
    }
    button[disabled] {
      opacity: 0.6;
      cursor: progress;
    }
    [role='alert'] {
      margin: 0;
      color: var(--warn);
      font-size: 0.85rem;
    }
    .mode {
      color: var(--muted);
      font-size: 0.75rem;
    }
    :host([defer-hydration]) .client,
    :host(:not([defer-hydration])) .server {
      display: none;
    }
  `;

  /** A problem from a post the server handled, passed in by the page. */
  @property() error?: string;

  @state() private problem?: string;
  @state() private sending = false;

  override render() {
    const problem = this.problem ?? this.error;
    return html`
      <form method="post" action="/sign" @submit=${this.submit}>
        <label>
          Your name
          <input
            name="name"
            required
            maxlength=${LIMITS.name}
            autocomplete="nickname"
          />
        </label>
        <label>
          A message
          <textarea
            name="message"
            required
            rows="3"
            maxlength=${LIMITS.message}
          ></textarea>
        </label>
        ${problem ? html`<p role="alert">${problem}</p>` : nothing}
        <div class="row">
          <span class="mode">
            <span class="server">Server HTML: posts as a plain form</span>
            <span class="client">Hydrated: posts through Eden</span>
          </span>
          <button ?disabled=${this.sending}>
            ${this.sending ? 'Signing…' : 'Sign the book'}
          </button>
        </div>
      </form>
    `;
  }

  private async submit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const fields = new FormData(form);
    this.sending = true;
    this.problem = undefined;
    try {
      const {error} = await api().api.entries.post({
        name: String(fields.get('name') ?? ''),
        message: String(fields.get('message') ?? ''),
      });
      if (error) {
        this.problem =
          error.status === 422
            ? 'Both a name and a message, please.'
            : `The server said no (${error.status}).`;
        return;
      }
      form.reset();
    } catch {
      this.problem = 'Could not reach the server.';
    } finally {
      this.sending = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sign-form': SignForm;
  }
}
