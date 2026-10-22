import {LitElement, css, html, nothing} from 'lit';
import {property} from 'lit/decorators.js';
import './icon.js';

/**
 * The big overview tile of a dashboard: an icon, a large value and a
 * caption. `accent` draws the icon and value in the brand colour, for the
 * one tile that leads.
 */
export class LitStatCard extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .card {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-6);
      border: var(--border-width) solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface-container);
    }
    lit-icon {
      font-size: 1.5rem;
      color: var(--text-secondary);
    }
    .value {
      font-size: var(--text-2xl);
      font-weight: var(--weight-extrabold);
      letter-spacing: var(--tracking-tight);
      line-height: var(--leading-tight);
      color: var(--text-strong);
    }
    .label {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }
    :host([accent]) lit-icon,
    :host([accent]) .value {
      color: var(--accent);
    }
  `;

  @property() icon = '';
  @property() value = '';
  @property() label = '';
  @property({type: Boolean, reflect: true}) accent = false;

  override render() {
    return html`<div class="card" part="card">
      ${
        this.icon === ''
          ? nothing
          : html`<lit-icon name=${this.icon} part="icon"></lit-icon>`
      }
      <span class="value" part="value">${this.value}</span>
      <span class="label" part="label">${this.label}</span>
    </div>`;
  }
}

customElements.define('lit-stat-card', LitStatCard);

declare global {
  interface HTMLElementTagNameMap {
    'lit-stat-card': LitStatCard;
  }
}
