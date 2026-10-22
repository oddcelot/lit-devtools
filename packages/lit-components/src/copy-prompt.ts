import {LitElement, css, html} from 'lit';
import {property, state} from 'lit/decorators.js';
import './button.js';
import './details.js';

/**
 * A prompt to paste into a coding agent: a heading and a copy button, with
 * the prompt itself folded away underneath for anyone who wants to read it
 * first. Announces the copy to screen readers.
 */
export class LitCopyPrompt extends LitElement {
  static override styles = css`
    :host {
      display: block;
      border: var(--border-width) solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-container);
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-6);
      padding: var(--space-5) var(--space-6);
    }
    .label {
      font-weight: var(--weight-semibold);
      color: var(--text-strong);
    }
    /* Both labels share one cell, so the button keeps its width. */
    .labels {
      display: inline-grid;
    }
    .labels > span {
      grid-area: 1 / 1;
    }
    .done,
    .copied .idle {
      visibility: hidden;
    }
    .copied .done {
      visibility: visible;
    }
    lit-details {
      border-top: var(--border-width) solid var(--border);
    }
    lit-details::part(header) {
      padding: var(--space-4) var(--space-6);
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
    lit-details::part(content) {
      padding: 0;
    }
    pre {
      margin: 0;
      padding: 0 var(--space-6) var(--space-6);
      white-space: pre-wrap;
      font-family: var(--font-mono);
      font-size: var(--text-xs);
      line-height: var(--leading-relaxed);
      color: var(--text);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `;

  /** The heading beside the copy button. */
  @property() label = '';
  /** What the button copies, and what the fold shows. */
  @property() text = '';
  /** The fold's summary. */
  @property() summary = 'Show the prompt';
  @state() private _copied = false;
  private _timer?: ReturnType<typeof setTimeout>;

  private async _copy() {
    await navigator.clipboard.writeText(this.text);
    this._copied = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => (this._copied = false), 2000);
  }

  override render() {
    return html`<div class="bar" part="bar">
        <span class="label" part="label">${this.label}</span>
        <lit-button class=${this._copied ? 'copied' : ''} @click=${this._copy}>
          <span class="labels">
            <span class="idle">Copy prompt</span>
            <span class="done" aria-hidden="true">Copied</span>
          </span>
        </lit-button>
      </div>
      <lit-details summary=${this.summary} appearance="plain">
        <pre part="text">${this.text}</pre>
      </lit-details>
      <span class="sr-only" role="status"
        >${this._copied ? 'Prompt copied' : ''}</span
      >`;
  }
}

customElements.define('lit-copy-prompt', LitCopyPrompt);

declare global {
  interface HTMLElementTagNameMap {
    'lit-copy-prompt': LitCopyPrompt;
  }
}
