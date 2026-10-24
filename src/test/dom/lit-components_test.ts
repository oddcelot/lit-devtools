import {afterEach, beforeAll, describe, expect, test} from 'vite-plus/test';
import type {LitButton} from '../../../packages/lit-components/src/button.js';
import type {LitIcon} from '../../../packages/lit-components/src/icon.js';
import type {LitSelect} from '../../../packages/lit-components/src/select.js';
import type {LitSwitch} from '../../../packages/lit-components/src/switch.js';

/**
 * The lit-* leaves in packages/lit-components extend Web Awesome's classes.
 * These check what the package adds (the tags, the design system's
 * defaults, lit-icon-button's icon) and that WA's behaviour survives the
 * subclassing, including inside WA containers that find children by tag,
 * then the compounds' own contracts: their events and what they render.
 * What needs a real browser (form submission, native validity, a dropdown's
 * popover) is in src/test/e2e/lit-components_test.ts.
 */
beforeAll(async () => {
  await import('../../../packages/lit-components/src/all.js');
  await import('@awesome.me/webawesome/dist/components/option/option.js');
  await import('@awesome.me/webawesome/dist/components/button-group/button-group.js');
});

afterEach(() => {
  document.body.replaceChildren();
});

const mount = async <T extends HTMLElement>(markup: string): Promise<T> => {
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.append(host);
  const el = host.firstElementChild as T & {updateComplete?: Promise<unknown>};
  await el.updateComplete;
  return el;
};

describe('lit-* leaves', () => {
  test.each([
    ['lit-badge', 'wa-badge'],
    ['lit-button', 'wa-button'],
    ['lit-callout', 'wa-callout'],
    ['lit-card', 'wa-card'],
    ['lit-copy-button', 'wa-copy-button'],
    ['lit-details', 'wa-details'],
    ['lit-icon', 'wa-icon'],
    ['lit-icon-button', 'wa-button'],
    ['lit-input', 'wa-input'],
    ['lit-select', 'wa-select'],
    ['lit-split-panel', 'wa-split-panel'],
    ['lit-switch', 'wa-switch'],
  ] as const)('%s is registered and extends %s', async (tag, base) => {
    const el = await mount(`<${tag}></${tag}>`);
    expect(el).toBeInstanceOf(customElements.get(base));
    expect(el.shadowRoot).not.toBeNull();
  });

  test.each([
    ['lit-button', {variant: 'brand', size: 's'}],
    ['lit-icon-button', {variant: 'neutral', appearance: 'plain', size: 's'}],
    ['lit-badge', {variant: 'neutral', appearance: 'filled-outlined'}],
    ['lit-input', {size: 's'}],
    ['lit-select', {size: 's'}],
    ['lit-switch', {size: 's'}],
    ['lit-callout', {size: 's'}],
  ] as const)(
    '%s starts with the design system defaults',
    async (tag, defaults) => {
      const el = await mount<HTMLElement & Record<string, unknown>>(
        `<${tag}></${tag}>`
      );
      for (const [name, value] of Object.entries(defaults)) {
        expect(el[name], name).toBe(value);
      }
    }
  );

  test('an attribute in markup overrides a default', async () => {
    const el = await mount<LitButton>(
      '<lit-button variant="danger" size="l">Delete</lit-button>'
    );
    expect(el.variant).toBe('danger');
    expect(el.size).toBe('l');
  });

  test('lit-button still fires click and honours disabled', async () => {
    const el = await mount<LitButton>('<lit-button>Go</lit-button>');
    let clicks = 0;
    el.addEventListener('click', () => clicks++);
    el.click();
    expect(clicks).toBe(1);
    el.disabled = true;
    await el.updateComplete;
    expect(
      el.shadowRoot!.querySelector('button')?.hasAttribute('disabled')
    ).toBe(true);
  });

  test('lit-button moves ARIA state from its host to its button', async () => {
    // The host has no role, so assistive tech ignores aria-pressed there.
    const el = await mount<LitButton>(
      '<lit-button aria-pressed="true">Docs</lit-button>'
    );
    const button = el.shadowRoot!.querySelector('button')!;
    expect(el.hasAttribute('aria-pressed')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    el.setAttribute('aria-pressed', 'false');
    await el.updateComplete;
    expect(el.hasAttribute('aria-pressed')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('lit-icon-button', () => {
  const iconOf = (el: HTMLElement) =>
    el.querySelector<LitIcon>(':scope > lit-icon');

  test('draws its icon, named by label', async () => {
    const el = await mount<HTMLElement>(
      '<lit-icon-button icon="gear" label="Settings"></lit-icon-button>'
    );
    expect(iconOf(el)?.name).toBe('gear');
    expect(iconOf(el)?.label).toBe('Settings');
  });

  test('keeps one icon in step with icon and label', async () => {
    const el = await mount<
      HTMLElement & {
        icon: string;
        label: string;
        updateComplete: Promise<unknown>;
      }
    >('<lit-icon-button icon="gear" label="Settings"></lit-icon-button>');
    el.icon = 'trash';
    el.label = 'Clear';
    await el.updateComplete;
    expect(el.querySelectorAll('lit-icon')).toHaveLength(1);
    expect(iconOf(el)?.name).toBe('trash');
    expect(iconOf(el)?.label).toBe('Clear');
    el.icon = '';
    await el.updateComplete;
    expect(iconOf(el)).toBeNull();
  });
});

describe('form controls keep Web Awesome behaviour', () => {
  test('lit-switch toggles and fires change', async () => {
    const el = await mount<LitSwitch>('<lit-switch>Flash</lit-switch>');
    let changes = 0;
    el.addEventListener('change', () => changes++);
    el.shadowRoot!.querySelector('input')!.click();
    await el.updateComplete;
    expect(el.checked).toBe(true);
    expect(changes).toBe(1);
  });

  test('lit-select takes its value from wa-option children', async () => {
    const el = await mount<LitSelect>(
      `<lit-select>
        <wa-option value="vscode">VS Code</wa-option>
        <wa-option value="zed" selected>Zed</wa-option>
      </lit-select>`
    );
    await new Promise((r) => setTimeout(r));
    expect(el.value).toBe('zed');
  });
});

describe('inside Web Awesome containers', () => {
  test('lit-button sits in a wa-button-group', async () => {
    const group = await mount<HTMLElement & {updateComplete: Promise<unknown>}>(
      `<wa-button-group label="Alignment">
        <lit-button>Left</lit-button>
        <lit-button>Right</lit-button>
      </wa-button-group>`
    );
    const slot = group.shadowRoot!.querySelector('slot')!;
    expect(slot.assignedElements().map((e) => e.localName)).toEqual([
      'lit-button',
      'lit-button',
    ]);
  });
});

describe('lit-* compounds', () => {
  type Updating = HTMLElement & {updateComplete: Promise<unknown>};

  test('lit-tabs renders its items and reports a pick once', async () => {
    const el = await mount<Updating & {items: unknown[]; value: string}>(
      '<lit-tabs value="a"></lit-tabs>'
    );
    el.items = [
      {id: 'a', label: 'Components'},
      {id: 'b', label: 'Updates', badge: 3, warnings: 2},
    ];
    await el.updateComplete;
    const root = el.shadowRoot!;
    expect(root.querySelectorAll('wa-tab')).toHaveLength(2);
    expect(
      [...root.querySelectorAll('lit-badge')].map((b) => b.textContent?.trim())
    ).toEqual(['3', '2']);

    const picks: string[] = [];
    el.addEventListener('change', (e) =>
      picks.push((e as CustomEvent<{value: string}>).detail.value)
    );
    const show = (name: string) =>
      root
        .querySelector('wa-tab-group')!
        .dispatchEvent(new CustomEvent('wa-tab-show', {detail: {name}}));
    show('a'); // the current value: the group echoing it, not a pick
    show('b');
    expect(picks).toEqual(['b']);
    expect(el.value).toBe('b');
  });

  test('lit-state-row toggles its children and says so', async () => {
    const el = await mount<Updating & {expanded: boolean}>(
      `<lit-state-row name="config" value="{…}" expandable>
        <lit-state-row name="open" value="true" type="boolean" depth="1"></lit-state-row>
      </lit-state-row>`
    );
    const toggles: boolean[] = [];
    el.addEventListener('toggle', (e) => {
      if (e.target === el) {
        toggles.push(
          (e as unknown as CustomEvent<{expanded: boolean}>).detail.expanded
        );
      }
    });
    el.shadowRoot!.querySelector('button')!.click();
    await el.updateComplete;
    expect(el.expanded).toBe(true);
    expect(el.hasAttribute('expanded')).toBe(true);
    expect(toggles).toEqual([true]);
  });

  test('lit-state-row has no toggle unless expandable', async () => {
    const el = await mount<Updating>(
      '<lit-state-row name="count" value="0" type="number"></lit-state-row>'
    );
    expect(el.shadowRoot!.querySelector('button')).toBeNull();
  });

  test('lit-tree-node selects on click and toggles on its caret only', async () => {
    const el = await mount<Updating & {selected: boolean; expanded: boolean}>(
      '<lit-tree-node tag="my-list" expandable></lit-tree-node>'
    );
    const events: string[] = [];
    el.addEventListener('select', () => events.push('select'));
    el.addEventListener('toggle', () => events.push('toggle'));
    el.shadowRoot!.querySelector('button')!.click();
    await el.updateComplete;
    expect(events).toEqual(['toggle']);
    expect(el.expanded).toBe(true);
    expect(el.selected).toBe(false);
    el.shadowRoot!.querySelector<HTMLElement>('.row')!.click();
    await el.updateComplete;
    expect(events).toEqual(['toggle', 'select']);
    expect(el.selected).toBe(true);
  });

  test('lit-stat-card shows its value and label', async () => {
    const el = await mount<Updating>(
      '<lit-stat-card icon="cube" value="24" label="custom elements"></lit-stat-card>'
    );
    const root = el.shadowRoot!;
    expect(root.querySelector('[part="value"]')?.textContent).toBe('24');
    expect(root.querySelector('[part="label"]')?.textContent).toBe(
      'custom elements'
    );
    expect(root.querySelector('lit-icon')?.getAttribute('name')).toBe('cube');
  });

  test('lit-run-gate fires run, waits while busy, and says when it cannot', async () => {
    const gate = await mount<
      HTMLElement & {
        busy: boolean;
        unsupported: string;
        updateComplete: Promise<unknown>;
      }
    >('<lit-run-gate>Connects to example.com.</lit-run-gate>');
    let runs = 0;
    gate.addEventListener('run', () => runs++);
    const button = () =>
      gate.shadowRoot!.querySelector<LitButton>('lit-button');
    button()!.click();
    expect(runs).toBe(1);

    gate.busy = true;
    await gate.updateComplete;
    expect(button()!.disabled).toBe(true);

    gate.unsupported = 'Not in this browser.';
    await gate.updateComplete;
    expect(button()).toBeNull();
    expect(gate.shadowRoot!.textContent).toContain('Not in this browser.');
  });

  test('lit-copy-prompt copies its text and announces it', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText: async (t: string) => void copied.push(t)},
    });
    const el = await mount<Updating>(
      '<lit-copy-prompt label="Set it up" text="Install the plugin."></lit-copy-prompt>'
    );
    el.shadowRoot!.querySelector<HTMLElement>('lit-button')!.click();
    await new Promise((r) => setTimeout(r));
    await el.updateComplete;
    expect(copied).toEqual(['Install the plugin.']);
    expect(el.shadowRoot!.querySelector('[role="status"]')?.textContent).toBe(
      'Prompt copied'
    );
  });
});
