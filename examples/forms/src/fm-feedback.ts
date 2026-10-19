import {LitElement, css, html} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import {FeedbackSchema} from './feedback-schema';
import {FormSchema} from './form-schema';
import './fm-text-field';
import './fm-switch';
import './fm-rating';
import './fm-tags';
import './fm-state-table';

/**
 * The page: a plain `<form>` holding the controls, with native submit
 * and reset buttons and a native checkbox that disables the `<fieldset>`.
 *
 * Its styles read the controls' custom states from outside with
 * `:has(:state(…))`: a dot marks an edited row, a summary appears while a
 * touched field is invalid, and Reset stays dim until something changed.
 * They also reach into the error lines through `::part(error)`.
 *
 * The rules are a valibot schema in `feedback-schema.ts`, which `FormSchema`
 * checks after every change. The markup holds none of them.
 * The table under the form is `<fm-state-table>`, which redraws itself, so
 * this page renders only on a submit, a reset or the fieldset checkbox.
 */
@customElement('fm-feedback')
export class FmFeedback extends LitElement {
  static override styles = css`
    :host {
      display: block;
      max-width: 36rem;
      margin: 0 auto;
      padding: 24px;
      --fm-accent: #5b4bdb;
    }
    h1 {
      margin: 0;
      color: var(--fm-accent);
    }
    fieldset {
      display: grid;
      gap: 18px;
      margin: 0;
      padding: 20px;
      border: 1px solid #dedbe9;
      border-radius: 10px;
      background: white;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .row > label {
      font-weight: 600;
    }
    .field {
      position: relative;
    }
    /* A dot beside any row whose control has been edited. */
    .field::before {
      content: '';
      position: absolute;
      left: -12px;
      top: 6px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--fm-accent);
      opacity: 0;
      transition: opacity 150ms;
    }
    /* The text fields are the row; the others sit inside it. */
    .field:is(:state(dirty), :has(:state(dirty)))::before {
      opacity: 1;
    }
    .note {
      margin: -12px 0 0;
      font-size: 0.875em;
      color: #6a6680;
    }
    .field:not(:has(#newsletter:state(checked))) + .note {
      display: none;
    }
    /* The error lines of the text fields and the tags, styled through their part. */
    fm-text-field::part(error)::before,
    fm-tags::part(error)::before {
      content: '⚠ ';
    }
    .summary {
      display: none;
      margin: 0;
      padding: 8px 12px;
      border-radius: 6px;
      background: #fff5f6;
      color: #c62f3d;
    }
    form:has(:state(user-invalid)) .summary {
      display: block;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
    button {
      font: inherit;
      padding: 8px 16px;
      border-radius: 6px;
      border: 1px solid var(--fm-accent);
      background: var(--fm-accent);
      color: white;
      cursor: pointer;
    }
    button[type='reset'] {
      background: white;
      color: var(--fm-accent);
    }
    form:not(:has(:state(dirty))) button[type='reset'] {
      opacity: 0.4;
    }
    .disable {
      margin-left: auto;
      align-self: center;
      font-size: 0.875em;
    }
    fm-state-table {
      display: block;
      margin-top: 24px;
    }
    pre {
      padding: 12px;
      border-radius: 6px;
      background: #1f1d2b;
      color: #e9e7f2;
      overflow: auto;
    }
  `;

  @query('form') private form!: HTMLFormElement;

  @state() private disabled = false;
  @state() private submitted?: [string, string][];

  constructor() {
    super();
    // Every rule of the form, checked after each change.
    new FormSchema(this, FeedbackSchema);
  }

  override render() {
    return html`
      <h1>Visit feedback</h1>
      <p>
        Four form-associated custom elements in a plain
        <code>&lt;form&gt;</code>. Submit it empty, tab through it, reset it,
        disable the fieldset. Turn the newsletter on, or give one star, and
        valibot asks for more. The table shows each control's
        <code>:state()</code>.
      </p>
      <form id="feedback" @submit=${this.#onSubmit} @reset=${this.#onReset}>
        <fieldset ?disabled=${this.disabled}>
          <p class="summary">Some answers need another look.</p>
          <fm-text-field
            class="field"
            name="name"
            label="Your name"
          ></fm-text-field>
          <fm-text-field
            class="field"
            name="email"
            label="Email"
            type="email"
            placeholder="you@example.com"
          ></fm-text-field>
          <div class="row field">
            <label for="rating">How was it?</label>
            <fm-rating id="rating" name="rating"></fm-rating>
          </div>
          <fm-tags
            class="field"
            name="tags"
            label="What stood out?"
            value="first visit"
            max="4"
            placeholder="Type a tag, press Enter"
          ></fm-tags>
          <fm-text-field
            class="field"
            name="comment"
            label="Anything to add?"
          ></fm-text-field>
          <div class="row field">
            <fm-switch id="newsletter" name="newsletter"></fm-switch>
            <label for="newsletter">Send me the newsletter</label>
          </div>
          <p class="note">One email a month, no more.</p>
          <div class="row field">
            <fm-switch id="terms" name="terms"></fm-switch>
            <label for="terms">I accept the terms</label>
          </div>
        </fieldset>
        <div class="actions">
          <button type="submit">Send</button>
          <button type="reset">Reset</button>
          <label class="disable">
            <input
              type="checkbox"
              @change=${(event: Event) =>
                (this.disabled = (event.target as HTMLInputElement).checked)}
            />
            Disable the fieldset
          </label>
        </div>
      </form>
      <fm-state-table for="feedback"></fm-state-table>
      ${
        this.submitted
          ? html`<p>Submitted <code>FormData</code>:</p>
              <pre>
${this.submitted.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>`
          : ''
      }
    `;
  }

  #onSubmit(event: SubmitEvent) {
    event.preventDefault();
    this.submitted = [...new FormData(this.form)].map(([key, value]) => [
      key,
      String(value),
    ]);
  }

  // Reset unticks the checkbox too; follow it.
  #onReset() {
    this.disabled = false;
    this.submitted = undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fm-feedback': FmFeedback;
  }
}
