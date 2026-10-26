import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import ui from './ui.css?css-sheet';

/** A value inside a container, with its type when that isn't plain. */
const item = (value: unknown): string =>
  value instanceof Date ? `Date(${value.toISOString()})` : describe(value)[1];

/** A value as the table shows it: its type, then what it holds. */
const describe = (value: unknown): [type: string, shown: string] => {
  if (value instanceof Date) return ['Date', value.toISOString()];
  if (value instanceof Map) {
    return ['Map', [...value].map(([k, v]) => `${k}: ${item(v)}`).join(', ')];
  }
  if (value instanceof Set) return ['Set', [...value].map(item).join(', ')];
  if (value instanceof URL) return ['URL', value.href];
  if (value instanceof RegExp) return ['RegExp', String(value)];
  if (typeof value === 'bigint') return ['BigInt', `${value}n`];
  if (Array.isArray(value)) return ['Array', `[${value.map(item).join(', ')}]`];
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${k}: ${item(v)}`);
    return ['Object', `{${entries.join(', ')}}`];
  }
  return [value === null ? 'null' : typeof value, String(value)];
};

/**
 * Lists its props with their types, and whether each came as an attribute
 * or was set as a property. The server renders the same table, so the
 * hydrated element only matches it if the browser got the same values.
 */
@customElement('prop-inspector')
export class PropInspector extends LitElement {
  static override styles = [
    ui,
    css`
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
      }
      th {
        color: var(--text-muted);
        font-weight: var(--weight-semibold);
        text-align: left;
      }
      th,
      td {
        padding: var(--space-3) var(--space-4);
        border-bottom: 1px solid var(--border-subtle);
        vertical-align: top;
      }
      td:nth-child(2) {
        color: var(--accent-cyan);
        font-family: var(--font-mono);
      }
      td:nth-child(3) {
        font-family: var(--font-mono);
        word-break: break-word;
      }
      .via {
        color: var(--text-secondary);
        white-space: nowrap;
      }
    `,
  ];

  @property() heading = '';
  @property({type: Number, attribute: 'item-count'}) itemCount = 0;
  @property({type: Boolean}) active = false;
  @property({attribute: false}) when?: Date;
  @property({attribute: false}) scores?: Map<string, number>;
  @property({attribute: false}) tags?: Set<string>;
  @property({attribute: false}) site?: URL;
  @property({attribute: false}) big?: bigint;
  @property({attribute: false}) pattern?: RegExp;
  @property({attribute: false}) nested?: {dates: Date[]};
  @property({attribute: false}) far?: number;

  static readonly shown = [
    ['heading', 'heading'],
    ['itemCount', 'item-count'],
    ['active', 'active'],
    ['when'],
    ['scores'],
    ['tags'],
    ['site'],
    ['big'],
    ['pattern'],
    ['nested'],
    ['far'],
  ] as const;

  override render() {
    const self = this as unknown as Record<string, unknown>;
    return html`
      <table>
        <tr>
          <th>Prop</th>
          <th>Type</th>
          <th>Value</th>
          <th>Arrived as</th>
        </tr>
        ${PropInspector.shown.map(([name, attribute]) => {
          const [type, shown] = describe(self[name]);
          return html`<tr>
            <td><code>${name}</code></td>
            <td>${type}</td>
            <td>${shown}</td>
            <td class="via">
              ${
                attribute === undefined
                  ? 'property'
                  : html`attribute <code>${attribute}</code>`
              }
            </td>
          </tr>`;
        })}
      </table>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prop-inspector': PropInspector;
  }
}
