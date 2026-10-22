import {html, type TemplateResult} from 'lit';
import '../src/button.js';

/** One component's entry on the page. */
export interface Section {
  tag: string;
  group: 'Actions' | 'Feedback' | 'Forms' | 'Layout' | 'DevTools';
  /** What it is built on, and its main attributes. */
  summary: string;
  /** The component in its variants; rendered once per scheme. */
  render: () => TemplateResult;
}

const VARIANTS = ['brand', 'neutral', 'success', 'warning', 'danger'] as const;
const APPEARANCES = [
  'accent',
  'filled',
  'outlined',
  'filled-outlined',
  'plain',
] as const;
const SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;

const matrix = (
  rows: readonly string[],
  cols: readonly string[],
  cell: (row: string, col: string) => TemplateResult
) =>
  html`<div
    class="matrix"
    style="grid-template-columns: auto repeat(${cols.length}, auto)"
  >
    <span></span>
    ${cols.map((c) => html`<span class="label">${c}</span>`)}
    ${rows.map(
      (r) => html`<span class="label">${r}</span>${cols.map((c) => cell(r, c))}`
    )}
  </div>`;

export const SECTIONS: Section[] = [
  {
    tag: 'lit-button',
    group: 'Actions',
    summary:
      'extends WaButton · defaults variant="brand" size="s" · variant, appearance, size, pill, disabled, loading, href',
    render: () => html`
      ${matrix(
        VARIANTS,
        APPEARANCES,
        (variant, appearance) =>
          html`<lit-button variant=${variant} appearance=${appearance}
            >Button</lit-button
          >`
      )}
      <div class="row">
        <span class="label">sizes</span>
        ${SIZES.map(
          (size) => html`<lit-button size=${size}>${size}</lit-button>`
        )}
      </div>
      <div class="row">
        <span class="label">states</span>
        <lit-button>Default</lit-button>
        <lit-button disabled>Disabled</lit-button>
        <lit-button loading>Loading</lit-button>
        <lit-button pill>Pill</lit-button>
        <lit-button with-caret>Caret</lit-button>
        <lit-button href="#lit-button">Link</lit-button>
      </div>
      <div class="row">
        <span class="label">icons</span>
        <lit-button
          ><wa-icon slot="start" name="play"></wa-icon>Run this demo</lit-button
        >
        <lit-button variant="neutral" appearance="outlined"
          >Open<wa-icon slot="end" name="arrow-square-out"></wa-icon
        ></lit-button>
        <lit-button variant="neutral" appearance="plain"
          ><wa-icon name="gear" label="Settings"></wa-icon
        ></lit-button>
      </div>
      <div class="row">
        <span class="label"
          >design-system looks: primary · secondary · ghost</span
        >
        <lit-button>Primary</lit-button>
        <lit-button variant="neutral" appearance="outlined"
          >Secondary</lit-button
        >
        <lit-button variant="neutral" appearance="plain">Ghost</lit-button>
      </div>
    `,
  },
];
