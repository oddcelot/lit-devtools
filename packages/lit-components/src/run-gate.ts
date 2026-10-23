import {LitElement, css, html} from 'lit';
import {property} from 'lit/decorators.js';
import './button.js';

/**
 * Stands in for something that connects to a third party when it starts (an
 * embedded StackBlitz project, a video host), so nothing loads until the
 * reader asks: a button, and what pressing it will do in the slot under it.
 * Pressing the button fires `run`; whatever listens starts the thing and
 * replaces the gate. `unsupported` replaces the button with a note instead,
 * for a browser that cannot run it at all.
 */
export class LitRunGate extends LitElement {
  static override styles = css`
    :host {
      display: grid;
      justify-items: center;
      gap: var(--space-5);
      max-width: 30rem;
      padding: var(--space-6);
      text-align: center;
    }
    .notice {
      font-size: var(--text-sm);
      color: var(--text-secondary);
      text-wrap: balance;
    }
    .unsupported {
      margin: 0;
      color: var(--text);
    }
  `;

  /** The button's text. */
  @property() label = 'Run this demo';
  /** Starting: the button stays pressed until the gate is replaced. */
  @property({type: Boolean, reflect: true}) busy = false;
  /** Why this browser cannot run it; shown instead of the button. */
  @property() unsupported = '';

  private _run() {
    this.dispatchEvent(new Event('run', {bubbles: true, composed: true}));
  }

  override render() {
    if (this.unsupported !== '') {
      return html`<p class="unsupported" part="unsupported">
        ${this.unsupported}
      </p>`;
    }
    return html`<lit-button
        part="button"
        size="m"
        pill
        ?loading=${this.busy}
        ?disabled=${this.busy}
        @click=${this._run}
        >${this.label}</lit-button
      >
      <div class="notice" part="notice"><slot></slot></div>`;
  }
}

// Called directly: see button.ts.
customElements.define('lit-run-gate', LitRunGate);

declare global {
  interface HTMLElementTagNameMap {
    'lit-run-gate': LitRunGate;
  }
}
