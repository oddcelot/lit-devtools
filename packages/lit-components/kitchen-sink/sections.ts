import {html, type TemplateResult} from 'lit';
import '@awesome.me/webawesome/dist/components/button-group/button-group.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '../src/all.js';
import {iconNames} from '../src/icons.js';

export const GROUPS = [
  'Actions',
  'Feedback',
  'Forms',
  'Layout',
  'Icons',
  'DevTools',
] as const;

/** One component's entry on the page. */
export interface Section {
  tag: string;
  group: (typeof GROUPS)[number];
  /** What it is built on, and its main attributes. */
  summary: string;
  /** The component in its variants; rendered once per scheme. */
  render: () => TemplateResult;
}

const VARIANTS = ['brand', 'neutral', 'success', 'warning', 'danger'] as const;
const SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;
const CALLOUT_ICON = {
  brand: 'info',
  neutral: 'gear',
  success: 'check',
  warning: 'warning',
  danger: 'warning',
} as const;

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

const row = (label: string, content: TemplateResult) =>
  html`<div class="row"><span class="label">${label}</span>${content}</div>`;

const stack = (content: TemplateResult) =>
  html`<div class="stack">${content}</div>`;

export const SECTIONS: Section[] = [
  {
    tag: 'lit-button',
    group: 'Actions',
    summary:
      'extends WaButton · defaults variant="brand" size="s" · variant, appearance, size, pill, disabled, loading, href',
    render: () => html`
      ${matrix(
        VARIANTS,
        ['accent', 'filled', 'outlined', 'filled-outlined', 'plain'],
        (variant, appearance) =>
          html`<lit-button variant=${variant} appearance=${appearance}
            >Button</lit-button
          >`
      )}
      ${row(
        'sizes',
        html`${SIZES.map(
          (size) => html`<lit-button size=${size}>${size}</lit-button>`
        )}`
      )}
      ${row(
        'states',
        html`<lit-button>Default</lit-button>
          <lit-button disabled>Disabled</lit-button>
          <lit-button loading>Loading</lit-button>
          <lit-button pill>Pill</lit-button>
          <lit-button with-caret>Caret</lit-button>
          <lit-button href="#lit-button">Link</lit-button>`
      )}
      ${row(
        'icons',
        html`<lit-button
            ><lit-icon slot="start" name="play"></lit-icon>Run this
            demo</lit-button
          >
          <lit-button variant="neutral" appearance="outlined"
            >Open<lit-icon slot="end" name="arrow-square-out"></lit-icon
          ></lit-button>`
      )}
      ${row(
        'in wa-button-group',
        html`<wa-button-group label="Alignment">
            <lit-button variant="neutral" appearance="outlined"
              >Left</lit-button
            >
            <lit-button variant="neutral" appearance="outlined"
              >Center</lit-button
            >
            <lit-button variant="neutral" appearance="outlined"
              >Right</lit-button
            >
          </wa-button-group>
          <wa-button-group label="Record">
            <lit-button>Record</lit-button>
            <lit-button>Stop</lit-button>
          </wa-button-group>`
      )}
      ${row(
        'as a wa-dropdown trigger',
        html`<wa-dropdown>
          <lit-button slot="trigger" variant="neutral" with-caret
            >Export</lit-button
          >
          <wa-dropdown-item>Snapshot</wa-dropdown-item>
          <wa-dropdown-item>Trace</wa-dropdown-item>
        </wa-dropdown>`
      )}
      ${row(
        'design-system looks: primary · secondary · ghost',
        html`<lit-button>Primary</lit-button>
          <lit-button variant="neutral" appearance="outlined"
            >Secondary</lit-button
          >
          <lit-button variant="neutral" appearance="plain">Ghost</lit-button>`
      )}
    `,
  },
  {
    tag: 'lit-icon-button',
    group: 'Actions',
    summary:
      'extends WaButton · adds icon, label · defaults variant="neutral" appearance="plain" size="s"',
    render: () => html`
      ${matrix(
        ['neutral', 'brand'],
        ['plain', 'outlined', 'filled', 'accent'],
        (variant, appearance) =>
          html`<lit-icon-button
            icon="gear"
            label="Settings"
            variant=${variant}
            appearance=${appearance}
          ></lit-icon-button>`
      )}
      ${row(
        'sizes',
        html`${SIZES.map(
          (size) =>
            html`<lit-icon-button
              icon="magnifying-glass"
              label="Search"
              size=${size}
            ></lit-icon-button>`
        )}`
      )}
      ${row(
        'toolbar',
        html`<lit-icon-button icon="play" label="Record"></lit-icon-button>
          <lit-icon-button icon="trash" label="Clear"></lit-icon-button>
          <lit-icon-button icon="copy" label="Copy"></lit-icon-button>
          <lit-icon-button icon="x" label="Close" disabled></lit-icon-button>`
      )}
    `,
  },
  {
    tag: 'lit-copy-button',
    group: 'Actions',
    summary: 'extends WaCopyButton · value, from, tooltip, disabled',
    render: () =>
      row(
        'copies its value',
        html`<code>npm install -D @oddsquad/vite-plugin-lit</code>
          <lit-copy-button
            value="npm install -D @oddsquad/vite-plugin-lit"
          ></lit-copy-button>
          <lit-copy-button value="x" disabled></lit-copy-button>`
      ),
  },
  {
    tag: 'lit-badge',
    group: 'Feedback',
    summary:
      'extends WaBadge · defaults variant="neutral" appearance="filled-outlined" · variant, appearance, pill, attention',
    render: () => html`
      ${matrix(
        VARIANTS,
        ['filled-outlined', 'filled', 'outlined', 'accent'],
        (variant, appearance) =>
          html`<lit-badge variant=${variant} appearance=${appearance}
            >${variant}</lit-badge
          >`
      )}
      ${row(
        'uses',
        html`<lit-badge>v3.2.1</lit-badge>
          <lit-badge variant="success">enabled</lit-badge>
          <lit-badge variant="brand" pill>12</lit-badge>
          <lit-badge variant="danger" attention="pulse">live</lit-badge>`
      )}
    `,
  },
  {
    tag: 'lit-callout',
    group: 'Feedback',
    summary:
      'extends WaCallout · defaults size="s" · variant, appearance, size; icon slot',
    render: () =>
      stack(
        html`${VARIANTS.map(
          (variant) =>
            html`<lit-callout variant=${variant}
              ><lit-icon slot="icon" name=${CALLOUT_ICON[variant]}></lit-icon
              ><strong>${variant}</strong> The panel reconnected after the dev
              server restarted.</lit-callout
            >`
        )}
        ${['filled', 'outlined', 'plain'].map(
          (appearance) =>
            html`<lit-callout variant="brand" appearance=${appearance}
              >appearance="${appearance}"</lit-callout
            >`
        )}`
      ),
  },
  {
    tag: 'lit-input',
    group: 'Forms',
    summary:
      'extends WaInput · defaults size="s" · type, appearance, with-clear, pill, label, hint, validation',
    render: () =>
      stack(
        html`<lit-input placeholder="Filter tags"
            ><lit-icon slot="start" name="magnifying-glass"></lit-icon
          ></lit-input>
          <lit-input value="hmr-counter" with-clear></lit-input>
          <lit-input
            label="Throttle (ms)"
            hint="How often the overlay re-measures"
            type="number"
            value="50"
          ></lit-input>
          <lit-input appearance="filled" placeholder="Filled"></lit-input>
          <lit-input pill placeholder="Pill"></lit-input>
          <lit-input disabled value="Disabled"></lit-input>
          <form>
            <lit-input
              required
              label="Required"
              placeholder="Empty"
            ></lit-input>
          </form>
          ${row(
            'sizes',
            html`${SIZES.map(
              (size) =>
                html`<lit-input size=${size} placeholder=${size}></lit-input>`
            )}`
          )}`
      ),
  },
  {
    tag: 'lit-switch',
    group: 'Forms',
    summary: 'extends WaSwitch · defaults size="s" · checked, disabled, size',
    render: () => html`
      ${row(
        'states',
        html`<lit-switch>off</lit-switch>
          <lit-switch checked>on</lit-switch>
          <lit-switch disabled>disabled</lit-switch>
          <lit-switch checked disabled>on, disabled</lit-switch>`
      )}
      ${row(
        'sizes',
        html`${SIZES.map(
          (size) => html`<lit-switch size=${size} checked>${size}</lit-switch>`
        )}`
      )}
    `,
  },
  {
    tag: 'lit-select',
    group: 'Forms',
    summary:
      'extends WaSelect · defaults size="s" · wa-option children · multiple, with-clear, appearance, label',
    render: () =>
      stack(
        html`<lit-select value="vscode" label="Editor">
            <wa-option value="vscode">VS Code</wa-option>
            <wa-option value="webstorm">WebStorm</wa-option>
            <wa-option value="zed">Zed</wa-option>
          </lit-select>
          <lit-select placeholder="Color scheme" with-clear>
            <wa-option value="auto">Auto</wa-option>
            <wa-option value="dark">Dark</wa-option>
            <wa-option value="light">Light</wa-option>
          </lit-select>
          <lit-select multiple label="Layers">
            <wa-option value="render" selected>Lit Render</wa-option>
            <wa-option value="update" selected>Lit Lifecycle</wa-option>
            <wa-option value="mouse">Mouse</wa-option>
          </lit-select>
          <lit-select disabled value="a">
            <wa-option value="a">Disabled</wa-option>
          </lit-select>`
      ),
  },
  {
    tag: 'lit-card',
    group: 'Layout',
    summary:
      'extends WaCard · appearance, with-header, with-footer, header-actions; slots',
    render: () => html`<div class="cards">
      <lit-card>A plain surface for a block of content.</lit-card>
      <lit-card with-header with-header-actions>
        <span slot="header">Reactive properties</span>
        <lit-icon-button
          slot="header-actions"
          icon="gear"
          label="Settings"
        ></lit-icon-button>
        label, factor and items, with their current values.
      </lit-card>
      <lit-card with-footer appearance="filled">
        Filled, with a footer.
        <lit-button slot="footer" variant="neutral" appearance="outlined"
          >Cancel</lit-button
        >
      </lit-card>
      <lit-card appearance="plain">appearance="plain"</lit-card>
    </div>`,
  },
  {
    tag: 'lit-details',
    group: 'Layout',
    summary:
      'extends WaDetails · summary, open, disabled, appearance, icon-placement',
    render: () =>
      stack(
        html`<lit-details summary="Show the prompt" open
            >Set up @oddsquad/vite-plugin-lit in this project…</lit-details
          >
          <lit-details summary="appearance=filled" appearance="filled"
            >Content</lit-details
          >
          <lit-details summary="appearance=plain" appearance="plain"
            >Content</lit-details
          >
          <lit-details summary="Disabled" disabled>Content</lit-details>`
      ),
  },
  {
    tag: 'lit-copy-prompt',
    group: 'Actions',
    summary: 'compound · label, text, summary · lit-button + lit-details',
    render: () =>
      html`<lit-copy-prompt
        label="Set it up with a coding agent"
        text=${'Set up @oddsquad/vite-plugin-lit in this project.\n\n1. Install it as a dev dependency.\n2. Add litPlugin() to the Vite config.'}
      ></lit-copy-prompt>`,
  },
  {
    tag: 'lit-segmented-tabs',
    group: 'Layout',
    summary:
      'compound over wa-tab-group · items [{id, label, icon, badge, warnings}], value, size · change',
    render: () => html`
      ${row(
        'md',
        html`<div class="tabs-bar">
          <lit-segmented-tabs
            value="components"
            .items=${[
              {id: 'components', label: 'Components', icon: 'cube'},
              {id: 'updates', label: 'Updates', badge: 3},
              {id: 'timeline', label: 'Timeline', warnings: 2},
              {id: 'settings', label: 'Settings', icon: 'gear'},
            ]}
          ></lit-segmented-tabs>
        </div>`
      )}
      ${row(
        'sm',
        html`<div class="tabs-bar">
          <lit-segmented-tabs
            size="sm"
            value="props"
            .items=${[
              {id: 'props', label: 'Properties'},
              {id: 'attrs', label: 'Attributes'},
              {id: 'events', label: 'Events'},
            ]}
          ></lit-segmented-tabs>
        </div>`
      )}
    `,
  },
  {
    tag: 'lit-stat-card',
    group: 'DevTools',
    summary: 'compound · icon, value, label, accent',
    render: () => html`<div class="cards">
      <lit-stat-card
        icon="package"
        value="v3.3.3"
        label="Lit"
        accent
      ></lit-stat-card>
      <lit-stat-card
        icon="cube"
        value="24"
        label="custom elements"
      ></lit-stat-card>
    </div>`,
  },
  {
    tag: 'lit-state-row',
    group: 'DevTools',
    summary:
      'compound · name, value, type, depth, expandable, expanded, badge · toggle',
    render: () => html`<div>
      <lit-state-row
        name="label"
        value='"initial"'
        type="string"
      ></lit-state-row>
      <lit-state-row name="factor" value="2" type="number"></lit-state-row>
      <lit-state-row name="open" value="false" type="boolean"></lit-state-row>
      <lit-state-row
        name="host"
        value="<hmr-counter>"
        type="ref"
      ></lit-state-row>
      <lit-state-row
        name="render"
        value="ƒ render()"
        type="function"
      ></lit-state-row>
      <lit-state-row name="parent" value="null" type="null"></lit-state-row>
      <lit-state-row
        name="config"
        value="{colorScheme: 'auto'}"
        expandable
        expanded
        badge="Reactive"
      >
        <lit-state-row
          name="colorScheme"
          value='"auto"'
          type="string"
          depth="1"
        ></lit-state-row>
        <lit-state-row
          name="dense"
          value="true"
          type="boolean"
          depth="1"
        ></lit-state-row>
      </lit-state-row>
    </div>`,
  },
  {
    tag: 'lit-tree-node',
    group: 'DevTools',
    summary:
      'compound · tag, depth, expandable, expanded, selected, badge · select, toggle',
    render: () => html`<div role="tree">
      <lit-tree-node tag="my-app" expandable expanded>
        <lit-tree-node tag="my-header" depth="1"></lit-tree-node>
        <lit-tree-node tag="my-list" depth="1" expandable expanded badge="3">
          <lit-tree-node tag="my-item" depth="2" selected></lit-tree-node>
          <lit-tree-node tag="my-item" depth="2"></lit-tree-node>
        </lit-tree-node>
        <lit-tree-node tag="my-footer" depth="1" expandable></lit-tree-node>
      </lit-tree-node>
    </div>`,
  },
  {
    tag: 'lit-icon',
    group: 'Icons',
    summary:
      'extends WaIcon · Phosphor, inlined by icons.ts · registerIcons() adds more',
    render: () =>
      html`<div class="icons">
        ${iconNames().map(
          (name) =>
            html`<span class="icon"
              ><lit-icon name=${name} label=${name}></lit-icon
              ><code>${name}</code></span
            >`
        )}
      </div>`,
  },
];
