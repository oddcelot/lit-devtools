import {afterEach, beforeAll, describe, expect, test, vi} from 'vite-plus/test';
import type {ComponentsView} from '../../panel/components-view.js';
import {
  ANATOMY_COLORS,
  type InspectorExtra,
  type InspectorTreeNode,
  type InspectorWarning,
} from '../../types/inspector.js';
import {
  answers,
  calls,
  meta,
  push,
  resetClient,
  setSnapshot,
} from './fakes/client.js';

vi.mock('../../panel/client.js', () => import('./fakes/client.js'));
import {resetHostInfo} from '../../panel/host.js';
import {useElementRevealer} from '../../panel/element-revealer.js';
import {useBreakpoints} from '../../panel/breakpoints.js';
import type {BreakTarget} from '../../types/inspector.js';
import {useSourceOpener} from '../../panel/source-opener.js';
import {overrides} from '../../panel/settings-override.js';
import {
  followElement,
  resetFollowedElement,
} from '../../panel/followed-element.js';
vi.mock('../../panel/in-page.js', () => import('./fakes/in-page.js'));
vi.mock(
  '../../panel/timeline-store.js',
  () => import('./fakes/timeline-store.js')
);
import {resetStore, setEvents} from './fakes/timeline-store.js';
import type {TimelineEvent} from '../../types/timeline.js';

beforeAll(async () => {
  await import('../../panel/components-view.js');
});

const tree: InspectorTreeNode[] = [
  {
    id: 1,
    tagName: 'x-app',
    children: [{id: 2, tagName: 'x-button', children: []}],
  } as InspectorTreeNode,
];

const flush = async (el: ComponentsView) => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
  }
};

const mount = async (picker = false, roots: InspectorTreeNode[] = tree) => {
  meta.picker = picker;
  // A fresh mount is a fresh panel: read the host again.
  resetHostInfo();
  answers.set('list-components', roots);
  answers.set('hmr-incompatibilities', []);
  if (!answers.has('hmr-history')) answers.set('hmr-history', {entries: []});
  const el = document.createElement('components-view');
  document.body.append(el);
  await flush(el);
  const root = el.shadowRoot!;
  return {
    el,
    root,
    pick: () => root.querySelector<HTMLElement>('wa-button.pick'),
    rows: () => [...root.querySelectorAll<HTMLElement>('.row')],
    inspects: () =>
      calls.filter((c) => c.name === 'inspect').map((c) => c.args[0]),
  };
};

const LIVE_LS_KEY = 'lit-devtools-components-live';
const WIDTH_LS_KEY = 'lit-devtools-components-details-width';
const COLLAPSED_LS_KEY = 'lit-devtools-components-collapsed';
const ANATOMY_LS_KEY = 'lit-devtools-components-anatomy';

afterEach(() => {
  document.body.replaceChildren();
  localStorage.removeItem(LIVE_LS_KEY);
  localStorage.removeItem(WIDTH_LS_KEY);
  localStorage.removeItem(COLLAPSED_LS_KEY);
  localStorage.removeItem(ANATOMY_LS_KEY);
  resetClient();
  resetHostInfo();
  resetStore();
});

test('offers Pick only when the page has a picker', async () => {
  expect((await mount(false)).pick()).toBeNull();
  document.body.replaceChildren();
  expect((await mount(true)).pick()).not.toBeNull();
});

test('never offers Pick in a snapshot', async () => {
  setSnapshot(true);
  expect((await mount(true)).pick()).toBeNull();
});

test('Pick starts the picker in the page', async () => {
  const {el, pick, inspects} = await mount(true);
  pick()!.click();
  await flush(el);
  expect(inspects()).toContainEqual({type: 'pick'});
  expect(pick()!.classList.contains('active')).toBe(true);
});

test('a pick from the page selects it and asks to be brought forward', async () => {
  const {el, pick, inspects} = await mount(true);
  pick()!.click();
  el.location.setTab('timeline');
  push('inspector-message', {type: 'pick', id: 2});
  await flush(el);
  expect(el.location.selected('components')).toBe(2);
  expect(inspects()).toContainEqual({type: 'details', id: 2});
  expect(el.location.tab).toBe('components');
  expect(pick()!.classList.contains('active')).toBe(false);
});

test('renders the tree it was primed with and selects on click', async () => {
  const {el, rows, inspects} = await mount();
  expect(rows().map((r) => r.querySelector('.tag')!.textContent)).toEqual([
    '<x-app>',
  ]);
  rows()[0]!.click();
  await flush(el);
  expect(el.location.selected('components')).toBe(1);
  expect(inspects()).toContainEqual({type: 'watch', id: 1});
});

test('selecting a nested element expands its ancestors', async () => {
  const {el, rows} = await mount();
  el.location.apply({componentId: 2});
  await flush(el);
  expect(rows().map((r) => r.querySelector('.tag')!.textContent)).toEqual([
    '<x-app>',
    '<x-button>',
  ]);
  expect(rows()[1]!.classList.contains('selected')).toBe(true);
});

const bigTree: InspectorTreeNode[] = [
  {
    id: 1,
    tagName: 'x-app',
    children: [
      {
        id: 2,
        tagName: 'x-header',
        children: [{id: 3, tagName: 'x-button', children: []}],
      },
      {
        id: 4,
        tagName: 'x-list',
        children: [
          {id: 5, tagName: 'x-item', children: []},
          {id: 6, tagName: 'x-item', children: []},
        ],
      },
    ],
  } as InspectorTreeNode,
];

const filterTree = async (el: ComponentsView, root: ShadowRoot, q: string) => {
  const input = root.querySelector<HTMLInputElement>('wa-input.tree-filter')!;
  input.value = q;
  input.dispatchEvent(new Event('input'));
  await flush(el);
};

const tags = (rows: HTMLElement[]) =>
  rows.map(
    (r) =>
      `${r.querySelector('.tag')!.textContent}${r.classList.contains('context') ? ' (context)' : ''}`
  );

const press = async (el: ComponentsView, row: HTMLElement, key: string) => {
  row.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true}));
  await flush(el);
};

const selectedTag = (rows: HTMLElement[]) =>
  rows
    .find((r) => r.getAttribute('aria-selected') === 'true')
    ?.querySelector('.tag')?.textContent;

test('arrow keys walk the tree like the Elements panel', async () => {
  const {el, rows} = await mount();
  expect(rows()[0]!.getAttribute('role')).toBe('treeitem');
  expect(rows()[0]!.getAttribute('aria-expanded')).toBe('false');
  await press(el, rows()[0]!, 'ArrowRight');
  expect(tags(rows())).toEqual(['<x-app>', '<x-button>']);
  expect(rows()[0]!.getAttribute('aria-expanded')).toBe('true');
  await press(el, rows()[0]!, 'ArrowDown');
  expect(selectedTag(rows())).toBe('<x-button>');
  expect(rows()[1]!.tabIndex).toBe(0);
  await press(el, rows()[1]!, 'ArrowLeft');
  expect(selectedTag(rows())).toBe('<x-app>');
  await press(el, rows()[0]!, 'ArrowLeft');
  expect(tags(rows())).toEqual(['<x-app>']);
});

test('the tree filter shows matches with their ancestors, opened', async () => {
  const {el, root, rows} = await mount(false, bigTree);
  expect(tags(rows())).toEqual(['<x-app>']);
  await filterTree(el, root, 'ITEM');
  expect(tags(rows())).toEqual([
    '<x-app> (context)',
    '<x-list> (context)',
    '<x-item>',
    '<x-item>',
  ]);
  expect(root.querySelector('.match-count')!.textContent).toBe('2');
  expect(
    [...root.querySelectorAll('.tree mark')].map((m) => m.textContent)
  ).toEqual(['item', 'item']);
});

test('clearing the tree filter brings back the expansion as it was', async () => {
  const {el, root, rows} = await mount(false, bigTree);
  await filterTree(el, root, 'button');
  expect(tags(rows())).toEqual([
    '<x-app> (context)',
    '<x-header> (context)',
    '<x-button>',
  ]);
  // The twisty is inert while filtering, so it cannot fold a path away.
  rows()[0]!.querySelector<HTMLElement>('.twisty')!.click();
  await flush(el);
  expect(rows()).toHaveLength(3);
  await filterTree(el, root, '');
  expect(tags(rows())).toEqual(['<x-app>']);
});

test('a tree filter with no match says so, and Escape clears it', async () => {
  const {el, root, rows} = await mount(false, bigTree);
  await filterTree(el, root, 'nope');
  expect(rows()).toHaveLength(0);
  expect(
    root
      .querySelector('.tree .no-match')!
      .textContent!.replace(/\s+/g, ' ')
      .trim()
  ).toBe('No elements match “nope”.');
  root
    .querySelector('wa-input.tree-filter')!
    .dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})
    );
  await flush(el);
  expect(tags(rows())).toEqual(['<x-app>']);
});

test('Shift-hover outlines every element with that tag', async () => {
  const {el, root, rows, inspects} = await mount(false, bigTree);
  await filterTree(el, root, 'item');
  const item = rows().find((r) => r.textContent!.includes('x-item'))!;
  item.dispatchEvent(new MouseEvent('mouseenter', {shiftKey: true}));
  await flush(el);
  expect(inspects().at(-1)).toEqual({type: 'highlight-all', ids: [5, 6]});
  expect(
    rows()
      .filter((r) => r.classList.contains('same-tag'))
      .map((r) => r.querySelector('.tag')!.textContent)
  ).toEqual(['<x-item>', '<x-item>']);

  // Letting go of Shift drops back to the one row under the pointer.
  window.dispatchEvent(new KeyboardEvent('keyup', {key: 'Shift'}));
  await flush(el);
  expect(inspects().at(-1)).toEqual({type: 'highlight', id: 5});
  expect(root.querySelector('.row.same-tag')).toBeNull();

  // And pressing it again goes back to all of them.
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Shift'}));
  await flush(el);
  expect(inspects().at(-1)).toEqual({type: 'highlight-all', ids: [5, 6]});

  root.querySelector('.tree')!.dispatchEvent(new MouseEvent('mouseleave'));
  await flush(el);
  expect(inspects().at(-1)).toEqual({type: 'highlight', id: null});
  expect(root.querySelector('.row.same-tag')).toBeNull();
});

test('Shift does nothing with no row under the pointer', async () => {
  const {el, inspects} = await mount(false, bigTree);
  const before = inspects().length;
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Shift'}));
  await flush(el);
  expect(inspects()).toHaveLength(before);
});

test('Anatomy stays on across a reload', async () => {
  const first = await mount(true);
  first.root.querySelector<HTMLElement>('wa-button.anatomy')!.click();
  await flush(first.el);
  expect(localStorage.getItem(ANATOMY_LS_KEY)).toBe('true');

  document.body.replaceChildren();
  const {el, root, inspects} = await mount(true);
  expect(
    root.querySelector('wa-button.anatomy')!.classList.contains('active')
  ).toBe(true);
  push('inspector-message', {type: 'pick', id: 2});
  await flush(el);
  // On again, so selecting draws the selection's anatomy straight away.
  expect(inspects()).toContainEqual({type: 'anatomy', id: 2});
});

test('Anatomy turned off stays off', async () => {
  localStorage.setItem(ANATOMY_LS_KEY, 'true');
  const {el, root} = await mount(true);
  root.querySelector<HTMLElement>('wa-button.anatomy')!.click();
  await flush(el);
  expect(localStorage.getItem(ANATOMY_LS_KEY)).toBe('false');
});

// The session's rules are `components-session_test.ts`'s; these check the
// element wires them to the page, the shell and storage.

test('pausing Live remembers it and pulls one fresh tree', async () => {
  const {el, root, inspects} = await mount();
  const before = inspects().length;
  root.querySelector<HTMLElement>('wa-button.live')!.click();
  await flush(el);
  expect(inspects().slice(before)).toEqual([
    {type: 'observe', enabled: false},
    {type: 'tree'},
  ]);
  expect(localStorage.getItem(LIVE_LS_KEY)).toBe('false');
});

test('never arms Live in a snapshot', async () => {
  setSnapshot(true);
  const {inspects} = await mount();
  expect(inspects()).toEqual([]);
});

const detailsFor = (extras?: InspectorExtra[]) => ({
  id: 2,
  tagName: 'x-button',
  attributes: [],
  properties: [],
  flags: {hasUpdated: true, isUpdatePending: false, hasShadowRoot: false},
  ...(extras === undefined ? {} : {extras}),
});

test('lists instance state below the other tables', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: detailsFor([
      {
        kind: 'task',
        name: 'userTask',
        value: '[1, 2]',
        type: 'Task',
        status: 'complete',
      },
      {kind: 'signal', name: 'count', value: '7', type: 'Signal.State'},
    ]),
  });
  await flush(el);
  const details = root.querySelector('.details')!;
  const labels = [...details.querySelectorAll('.label')].map(
    (l) => l.textContent
  );
  expect(labels).toEqual(['Instance']);
  const rows = [...details.querySelectorAll('.entry')].map((r) =>
    [...r.querySelectorAll(':scope > .name, :scope > .val')].map((c) =>
      c.textContent!.replace(/\s+/g, ' ').trim()
    )
  );
  // The kind and a task's status follow the name.
  expect(rows).toEqual([
    ['userTasktaskcomplete', '[1, 2]'],
    ['countsignal', '7'],
  ]);
  expect(
    details.querySelector('.entry .status')!.classList.contains('task-complete')
  ).toBe(true);
});

test('tags a value with its type only where the preview does not show it', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  const prop = (name: string, value: string, type: string) => ({
    name,
    value,
    type,
    attribute: name,
    reflects: false,
    state: false,
  });
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      properties: [
        prop('label', '"Save"', 'string'),
        prop('items', '[1, 2, 3]', 'Array(3)'),
        prop('lookup', 'Map(2)', 'Map(2)'),
      ],
    },
  });
  await flush(el);
  const types = [...root.querySelectorAll('.details .entry')].map(
    (r) => r.querySelector('.type')?.textContent ?? null
  );
  expect(types).toEqual([null, 'Array(3)', null]);
});

test('badges the options a property sets beyond the defaults', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  const prop = (name: string, extra: object = {}) => ({
    name,
    value: '1',
    type: 'number',
    attribute: name,
    reflects: false,
    state: false,
    ...extra,
  });
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      properties: [
        prop('plain'),
        prop('custom', {options: ['hasChanged', 'converter']}),
        prop('manual', {
          attribute: false,
          options: ['noAccessor', 'useDefault'],
        }),
        prop('hidden', {attribute: false, state: true}),
      ],
    },
  });
  await flush(el);
  const badges = [...root.querySelectorAll('.details .entry')].map((r) =>
    [...r.querySelectorAll('wa-badge')].map((b) => b.textContent?.trim())
  );
  expect(badges).toEqual([
    [],
    ['hasChanged', 'converter'],
    ['no attr', 'noAccessor', 'useDefault'],
    [],
  ]);
});

test('groups properties by the class that declared them, own first', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  const prop = (name: string, by?: string, depth = 0) => ({
    name,
    value: '1',
    type: 'number',
    attribute: name,
    reflects: false,
    state: false,
    ...(by === undefined ? {} : {declaredBy: {name: by, depth}}),
  });
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      properties: [
        prop('size', 'BaseButton', 1),
        prop('label', 'XButton'),
        prop('variant', 'BaseButton', 1),
      ],
    },
  });
  await flush(el);
  const kv = root.querySelector('[data-section="Properties"] .kv')!;
  const lines = [...kv.children].map((c) =>
    c.classList.contains('class-group')
      ? `# ${c.textContent!.trim()}`
      : c.querySelector('.name')!.textContent!.trim()
  );
  expect(lines).toEqual([
    '# XButton',
    'label',
    '# BaseButton',
    'size',
    'variant',
  ]);
});

test('shows no class headings when the runtime named no classes', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      properties: [
        {
          name: 'label',
          value: '""',
          type: 'string',
          attribute: 'label',
          reflects: false,
          state: false,
        },
      ],
    },
  });
  await flush(el);
  expect(root.querySelector('.class-group')).toBeNull();
});

const withAttributes = () => ({
  ...detailsFor([{kind: 'signal', name: 'count', value: '7', type: 'Signal'}]),
  attributes: [
    {name: 'a', value: '1'},
    {name: 'b', value: '2'},
  ],
});

const sections = (root: ShadowRoot) =>
  [
    ...root.querySelectorAll<HTMLDetailsElement>('.details details.section'),
  ].map(
    (s) =>
      `${s.querySelector('.label')!.textContent} ${s.querySelector('.count')!.textContent} ${s.open ? 'open' : 'folded'}`
  );

test('each section heading counts its rows', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: withAttributes()});
  await flush(el);
  expect(sections(root)).toEqual(['Attributes 2 open', 'Instance 1 open']);
});

test('a folded section stays folded, and is remembered', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: withAttributes()});
  await flush(el);
  const attrs = root.querySelector<HTMLDetailsElement>(
    'details[data-section="Attributes"]'
  )!;
  attrs.open = false;
  attrs.dispatchEvent(new Event('toggle'));
  await flush(el);
  expect(sections(root)).toEqual(['Attributes 2 folded', 'Instance 1 open']);
  expect(JSON.parse(localStorage.getItem(COLLAPSED_LS_KEY)!)).toEqual([
    'Attributes',
  ]);

  document.body.replaceChildren();
  const again = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: withAttributes()});
  await flush(again.el);
  expect(sections(again.root)).toEqual([
    'Attributes 2 folded',
    'Instance 1 open',
  ]);
});

const filterable = () => ({
  ...detailsFor([
    {kind: 'field', name: 'renders', value: '3', type: 'number'},
    {
      kind: 'task',
      name: 'userTask',
      value: '"Ada"',
      type: 'Task',
      status: 'complete',
    },
  ]),
  properties: [
    {
      name: 'label',
      value: '"Save"',
      type: 'string',
      attribute: 'label',
      reflects: false,
      state: false,
    },
    {
      name: 'userId',
      value: '1',
      type: 'number',
      attribute: false,
      reflects: false,
      state: true,
    },
  ],
  attributes: [{name: 'data-renders', value: '3'}],
});

const typeFilter = async (el: ComponentsView, root: ShadowRoot, q: string) => {
  const input = root.querySelector<HTMLInputElement>(
    '.details wa-input.filter'
  )!;
  input.value = q;
  input.dispatchEvent(new Event('input'));
  await flush(el);
};

const names = (root: ShadowRoot) =>
  [...root.querySelectorAll('.details .entry > .name')].map((n) =>
    n.textContent!.replace(/\s+/g, ' ').trim()
  );

test('the filter keeps rows whose name or value matches', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  await typeFilter(el, root, 'USER');
  expect(sections(root)).toEqual(['State 1/1 open', 'Instance 1/2 open']);
  expect(names(root)).toEqual(['userId', 'userTasktaskcomplete']);
  expect(
    [...root.querySelectorAll('.details mark')].map((m) => m.textContent)
  ).toEqual(['user', 'user']);

  // A value match counts too: "Ada" is only in userTask's value.
  await typeFilter(el, root, 'ada');
  expect(names(root)).toEqual(['userTasktaskcomplete']);
});

test('a filter with no match says so', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  await typeFilter(el, root, 'nope');
  expect(sections(root)).toEqual([]);
  expect(
    root
      .querySelector('.details .no-match')!
      .textContent!.replace(/\s+/g, ' ')
      .trim()
  ).toBe('No rows match “nope”.');
});

test('a folded section opens while filtering and folds again after', async () => {
  localStorage.setItem(COLLAPSED_LS_KEY, JSON.stringify(['Instance']));
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  expect(sections(root)).toContain('Instance 2 folded');
  await typeFilter(el, root, 'renders');
  expect(sections(root)).toEqual(['Attributes 1/1 open', 'Instance 1/2 open']);
  // The forced open fires toggle; it must not count as unfolding.
  root
    .querySelector('details[data-section="Instance"]')!
    .dispatchEvent(new Event('toggle'));
  await typeFilter(el, root, '');
  expect(sections(root)).toContain('Instance 2 folded');
  expect(JSON.parse(localStorage.getItem(COLLAPSED_LS_KEY)!)).toEqual([
    'Instance',
  ]);
});

test('Escape clears the filter', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  await typeFilter(el, root, 'user');
  root
    .querySelector('.details wa-input.filter')!
    .dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})
    );
  await flush(el);
  expect(names(root)).toHaveLength(5);
});

test('the filter stays set when another element is selected', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  await typeFilter(el, root, 'label');
  push('inspector-message', {type: 'pick', id: 3});
  push('inspector-message', {
    type: 'details',
    details: {...filterable(), id: 3},
  });
  await flush(el);
  expect(
    root.querySelector<HTMLInputElement>('.details wa-input.filter')!.value
  ).toBe('label');
  expect(names(root)).toEqual(['label']);
});

test('filtering slots keeps each row on its own colour', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  const slot = (name: string, tag: string) => ({
    name,
    status: 'assigned' as const,
    elements: [{tagName: tag}],
    moreElements: 0,
    textNodes: 0,
    forwarded: false,
    duplicate: false,
  });
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      anatomy: {
        renderRoot: 'shadow',
        mode: 'open',
        slots: [slot('icon', 'svg'), slot('', 'p')],
        orphans: [],
        orphanText: 0,
        parts: [],
      },
    },
  });
  await flush(el);
  await typeFilter(el, root, 'default');
  expect(sections(root)).toEqual(['Slots 1/2 open']);
  const swatch = root.querySelector<HTMLElement>('.details .swatch')!;
  // Slot 1's colour, not slot 0's, though it is the only row left.
  expect(swatch.getAttribute('style')).toContain(ANATOMY_COLORS[1]);
});

const regionDetails = (extra = {}) => ({
  ...detailsFor(),
  ...extra,
  anatomy: {
    renderRoot: 'shadow' as const,
    mode: 'open' as const,
    slots: [
      {
        name: '',
        status: 'assigned' as const,
        elements: [{tagName: 'p'}],
        moreElements: 0,
        textNodes: 0,
        forwarded: false,
        duplicate: false,
      },
    ],
    orphans: [],
    orphanText: 0,
    parts: [{names: ['header'], tagName: 'header'}],
  },
});

const mountRegions = async () => {
  const m = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: regionDetails()});
  await flush(m.el);
  const rows = [...m.root.querySelectorAll<HTMLElement>('.entry.region')];
  expect(rows).toHaveLength(2);
  const hover = async (row: HTMLElement, type: string) => {
    row.dispatchEvent(new MouseEvent(type));
    await flush(m.el);
  };
  const anatomyCalls = () =>
    m
      .inspects()
      .filter((c) => (c as {type: string}).type.startsWith('anatomy'));
  return {...m, rows, hover, anatomyCalls};
};

test.each([
  ['slot', 0],
  ['part', 1],
] as const)(
  'hovering a %s row draws just its region while Anatomy is off',
  async (kind, row) => {
    const {rows, hover, anatomyCalls} = await mountRegions();
    await hover(rows[row], 'mouseenter');
    expect(anatomyCalls()).toEqual([
      {type: 'anatomy', id: 2, only: {kind, index: 0}},
    ]);
    await hover(rows[row], 'mouseleave');
    expect(anatomyCalls().at(-1)).toEqual({type: 'anatomy', id: null});
  }
);

test('re-renders under a hovered row do not resend the solo region', async () => {
  const {el, rows, hover, anatomyCalls} = await mountRegions();
  await hover(rows[0], 'mouseenter');
  push('inspector-message', {type: 'details', details: regionDetails()});
  await flush(el);
  expect(anatomyCalls()).toHaveLength(1);
});

test('with Anatomy on a hovered row focuses and sends no solo region', async () => {
  const {el, root, rows, hover, anatomyCalls} = await mountRegions();
  root.querySelector<HTMLElement>('wa-button.anatomy')!.click();
  await flush(el);
  await hover(rows[0], 'mouseenter');
  expect(anatomyCalls()).toEqual([
    {type: 'anatomy', id: 2},
    {type: 'anatomy-focus', focus: {kind: 'slot', index: 0}},
  ]);
});

test('a snapshot draws nothing for a hovered row', async () => {
  setSnapshot(true);
  const {rows, hover, anatomyCalls} = await mountRegions();
  await hover(rows[0], 'mouseenter');
  expect(anatomyCalls()).toEqual([]);
});

test('a refresh highlights the rows whose value changed', async () => {
  const animate = vi.fn();
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'animate'
  );
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    value: animate,
    configurable: true,
  });
  try {
    const {el} = await mount(true);
    push('inspector-message', {type: 'pick', id: 2});
    push('inspector-message', {type: 'details', details: filterable()});
    await flush(el);
    // The first snapshot of a selection changes nothing.
    expect(animate).not.toHaveBeenCalled();

    const next = filterable();
    next.properties[1] = {...next.properties[1]!, value: '2'};
    next.attributes = [{name: 'data-renders', value: '4'}];
    push('inspector-message', {type: 'details', details: next});
    await flush(el);
    const flashed = animate.mock.contexts.map(
      (row) => (row as HTMLElement).dataset['key']
    );
    expect(flashed).toEqual(['p:userId', 'a:data-renders']);
  } finally {
    if (original === undefined) {
      delete (HTMLElement.prototype as {animate?: unknown}).animate;
    } else {
      Object.defineProperty(HTMLElement.prototype, 'animate', original);
    }
  }
});

const expandable = () => ({
  ...detailsFor(),
  properties: [
    {
      name: 'config',
      value: '{theme: {mode: "dark"}}',
      type: 'object',
      attribute: false as const,
      reflects: false,
      state: false,
      expandable: true,
    },
    {
      name: 'label',
      value: '"Save"',
      type: 'string',
      attribute: 'label',
      reflects: false,
      state: false,
    },
  ],
});

const configPath = (...keys: Array<string | number>) => ({
  section: 'prop' as const,
  name: 'config',
  keys,
});

test('an expandable value opens to its children on demand', async () => {
  const {el, root, inspects} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: expandable()});
  await flush(el);
  const expanders = root.querySelectorAll<HTMLElement>('.details .expander');
  // Only the object expands; a string has nothing under it.
  expect(expanders).toHaveLength(1);
  expanders[0]!.click();
  await flush(el);
  expect(inspects()).toContainEqual({
    type: 'expand',
    id: 2,
    path: configPath(),
  });
  expect(root.querySelector('.details .children')!.textContent!.trim()).toBe(
    '…'
  );

  push('inspector-message', {
    type: 'expanded',
    id: 2,
    path: configPath(),
    children: [
      {
        label: 'theme',
        key: 'theme',
        value: '{mode: "dark"}',
        type: 'object',
        expandable: true,
      },
      {
        label: 'size',
        key: 'size',
        value: '3',
        type: 'number',
        expandable: false,
      },
    ],
    more: 4,
  });
  await flush(el);
  const children = [
    ...root.querySelectorAll('.details .children > .child'),
  ].map((c) => c.textContent!.replace(/\s+/g, ' ').trim());
  expect(children).toEqual(['theme: {mode: "dark"}', 'size: 3', '+4 more']);
  // The open row shows its type in place of the preview.
  expect(
    root.querySelector('.details .entry[data-key="p:config"] .val > .t-type')!
      .textContent
  ).toBe('Object');

  root.querySelector<HTMLElement>('.details .child .expander')!.click();
  await flush(el);
  expect(inspects()).toContainEqual({
    type: 'expand',
    id: 2,
    path: configPath('theme'),
  });
});

test('a changed value asks again for what is open under it', async () => {
  const {el, root, inspects} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: expandable()});
  await flush(el);
  root.querySelector<HTMLElement>('.details .expander')!.click();
  await flush(el);
  const expands = () =>
    inspects().filter((c) => (c as {type: string}).type === 'expand');
  const before = expands().length;
  const next = expandable();
  next.properties[0] = {
    ...next.properties[0]!,
    value: '{theme: {mode: "light"}}',
  };
  push('inspector-message', {type: 'details', details: next});
  await flush(el);
  expect(expands()).toHaveLength(before + 1);
});

test('a snapshot cannot expand values', async () => {
  setSnapshot(true);
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: expandable()});
  await flush(el);
  expect(root.querySelector('.details .expander')).toBeNull();
});

test('a row copies its value as shown, an attribute without quotes', async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', {
    value: {writeText},
    configurable: true,
  });
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  const copyOf = (key: string) =>
    root.querySelector<HTMLElement>(
      `.details .entry[data-key="${key}"] .copy`
    )!;

  copyOf('p:label').click();
  await flush(el);
  copyOf('a:data-renders').click();
  await flush(el);
  expect(writeText.mock.calls).toEqual([['"Save"'], ['3']]);
  // The last one copied says so until the moment passes.
  expect(copyOf('a:data-renders').classList.contains('copied')).toBe(true);
  expect(copyOf('p:label').classList.contains('copied')).toBe(false);
});

test('a refused clipboard falls back to a selected textarea', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: {writeText: vi.fn(async () => Promise.reject(new Error('denied')))},
    configurable: true,
  });
  const exec = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', {
    value: exec,
    configurable: true,
  });
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  root
    .querySelector<HTMLElement>('.details .entry[data-key="p:label"] .copy')!
    .click();
  await flush(el);
  expect(exec).toHaveBeenCalledWith('copy');
  expect(document.querySelector('textarea')).toBeNull();
  expect(
    root
      .querySelector('.details .entry[data-key="p:label"] .copy')!
      .classList.contains('copied')
  ).toBe(true);
});

test('attribute values read as quoted strings', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      attributes: [{name: 'data-renders', value: '2'}],
    },
  });
  await flush(el);
  const val = root.querySelector('.details .entry .val')!;
  expect(val.textContent).toBe('"2"');
  expect(val.querySelector('.t-string')!.textContent).toBe('"2"');
});

test('a long value takes its own line under the name', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      attributes: [
        {name: 'short', value: 'a'},
        {name: 'long', value: 'x'.repeat(60)},
      ],
    },
  });
  await flush(el);
  const wide = [...root.querySelectorAll('.details .entry')].map((r) =>
    r.classList.contains('wide')
  );
  expect(wide).toEqual([false, true]);
});

test('Scroll into view reveals the selected element in the page', async () => {
  const {el, root, inspects} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor([])});
  await flush(el);
  root
    .querySelector<HTMLElement>('.details [aria-label="Scroll into view"]')!
    .click();
  expect(inspects()).toContainEqual({type: 'reveal', id: 2});
});

test('Store as global variable sends the row path to the page', async () => {
  const {el, root, inspects} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: filterable()});
  await flush(el);
  root
    .querySelector<HTMLElement>('.details .entry[data-key="p:label"] .store')!
    .click();
  expect(inspects()).toContainEqual({
    type: 'store-global',
    id: 2,
    path: {section: 'prop', name: 'label', keys: []},
  });
});

test('Request update asks the selected element to update', async () => {
  const {el, root, inspects} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor([])});
  await flush(el);
  root.querySelector<HTMLElement>('[data-action="request-update"]')!.click();
  expect(inspects()).toContainEqual({type: 'request-update', id: 2});
});

test('offers no Request update for an element that is not Lit', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {...detailsFor([]), notLit: true},
  });
  await flush(el);
  expect(root.querySelector('.details h2')).not.toBeNull();
  expect(root.querySelector('[data-action="request-update"]')).toBeNull();
});

test('never offers Scroll into view in a snapshot', async () => {
  setSnapshot(true);
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor([])});
  await flush(el);
  expect(root.querySelector('.details h2')).not.toBeNull();
  expect(root.querySelector('wa-button.reveal')).toBeNull();
});

test('a context row shows its key and links to the provider element', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: detailsFor([
      {
        kind: 'context',
        name: 'theme',
        value: '"dark"',
        type: 'ContextConsumer',
        context: {
          role: 'consumer',
          key: 'Symbol(theme)',
          provider: {tagName: 'x-app', id: 1},
        },
      },
      {
        kind: 'context',
        name: 'orphan',
        value: '1',
        type: 'ContextConsumer',
        context: {role: 'consumer', key: 'lost'},
      },
      {
        kind: 'context',
        name: 'pending',
        value: 'undefined',
        type: 'ContextConsumer',
        context: {role: 'consumer', key: 'late', waiting: true},
      },
    ]),
  });
  await flush(el);
  const rows = [...root.querySelectorAll('.details .entry')];
  expect(rows[0]!.textContent).toContain('Symbol(theme)');
  expect(rows[1]!.textContent).toContain('no provider found');
  expect(rows[2]!.textContent).toContain('waiting for a provider');
  rows[0]!.querySelector<HTMLButtonElement>('.el-ref')!.click();
  await flush(el);
  expect(el.location.selected('components')).toBe(1);
});

test('a provider row lists its consumers as links', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 1});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor([
        {
          kind: 'context',
          name: 'provider',
          value: '1',
          type: 'ContextProvider',
          context: {
            role: 'provider',
            key: 'k',
            consumers: [{tagName: 'x-button', id: 2}],
            moreConsumers: 3,
          },
        },
      ]),
      id: 1,
    },
  });
  await flush(el);
  const links = root.querySelectorAll('.details .ctx-links .el-ref');
  expect([...links].map((l) => l.textContent!.trim())).toEqual(['<x-button>']);
  expect(root.querySelector('.details .ctx-links')!.textContent).toContain(
    '+3 more'
  );
});

test('shows no Instance section without extras', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor()});
  await flush(el);
  expect(root.querySelector('.details h2')!.textContent?.trim()).toBe(
    '<x-button>'
  );
  expect(root.querySelector('.details .label')).toBeNull();
});

const metaRows = (root: ShadowRoot) =>
  [...root.querySelectorAll('.details .meta dt')].map(
    (dt) => `${dt.textContent} ${dt.nextElementSibling!.textContent!.trim()}`
  );

const statuses = (root: ShadowRoot) =>
  [...root.querySelectorAll('.details .head .status')].map(
    (s) => s.textContent
  );

test('a settled element shows no status next to its tag', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor()});
  await flush(el);
  expect(statuses(root)).toEqual([]);
});

test('a queued or first update shows as a status next to the tag', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      flags: {hasUpdated: false, isUpdatePending: true, hasShadowRoot: true},
    },
  });
  await flush(el);
  expect(statuses(root)).toEqual(['pending', 'not rendered']);
});

test('the render root reads as one line under the locations', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      source: {file: 'src/b.ts', line: 4},
      anatomy: {
        renderRoot: 'shadow',
        mode: 'open',
        delegatesFocus: true,
        slots: [],
        orphans: [],
        orphanText: 0,
        parts: [],
      },
    },
  });
  await flush(el);
  expect(metaRows(root)).toEqual([
    'defined src/b.ts:4',
    'root shadow, open, delegatesFocus',
  ]);
});

test('a light DOM element says so', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      anatomy: {
        renderRoot: 'light',
        slots: [],
        orphans: [],
        orphanText: 0,
        parts: [],
      },
    },
  });
  await flush(el);
  expect(metaRows(root)).toEqual(['root light DOM']);
});

const emptyText = async () => {
  const {el, root} = await mount(false, []);
  return {
    el,
    text: () =>
      root.querySelector('.empty')!.textContent!.replace(/\s+/g, ' ').trim(),
  };
};

test('says the runtime has not connected when no runtime ever announced', async () => {
  meta.runtime = {
    ready: false,
    litPackages: {},
    topFrame: true,
    chromeTracks: true,
  };
  const {el, text} = await emptyText();
  expect(text()).toContain('has not connected');

  // The runtime arriving later replaces the diagnosis.
  push('inspector-message', {
    type: 'ready',
    litPackages: {'lit-element': ['4.2.2']},
    topFrame: true,
  });
  await flush(el);
  expect(text()).toBe('No Lit components found on the page.');
});

test('names both versions when more than one copy of lit is loaded', async () => {
  meta.runtime = {
    ready: true,
    litPackages: {'lit-element': ['4.2.2', '4.1.0']},
    topFrame: true,
    chromeTracks: true,
  };
  const {text} = await emptyText();
  expect(text()).toContain('More than one copy of lit');
  expect(text()).toContain('lit-element 4.2.2, 4.1.0');
});

test('explains an empty tree inside an iframe', async () => {
  meta.runtime = {
    ready: true,
    litPackages: {'lit-element': ['4.2.2']},
    topFrame: false,
    chromeTracks: true,
  };
  expect((await emptyText()).text()).toContain('iframe');
});

test('says which runtime serves a page two of them loaded on', async () => {
  const {el, root} = await mount(false);
  const banner = () =>
    root.querySelector('.runtimes-banner')?.textContent?.replace(/\s+/g, ' ');
  push('inspector-message', {type: 'ready', runtimes: ['vite']});
  await flush(el);
  expect(banner()).toBeUndefined();

  // The dev server's runtime joined the extension's: it re-announces both.
  push('inspector-message', {type: 'ready', runtimes: ['extension', 'vite']});
  await flush(el);
  expect(banner()?.trim()).toBe(
    "The Lit Inspector extension serves this page; the dev server's plugin shares its runtime."
  );
});

test('never names runtimes in a snapshot', async () => {
  setSnapshot(true);
  meta.runtime = {
    ready: true,
    litPackages: {},
    topFrame: true,
    chromeTracks: true,
    runtimes: ['extension', 'vite'],
  };
  const {root} = await mount(false);
  expect(root.querySelector('.runtimes-banner')).toBeNull();
});

test('keeps the plain message for a healthy runtime with no components', async () => {
  expect((await emptyText()).text()).toBe(
    'No Lit components found on the page.'
  );
});

test('never blames the runtime in a snapshot', async () => {
  setSnapshot(true);
  meta.runtime = {
    ready: false,
    litPackages: {},
    topFrame: true,
    chromeTracks: true,
  };
  expect((await emptyText()).text()).toBe(
    'No Lit components found on the page.'
  );
});

test('does not add a diagnosis to a tree that has components', async () => {
  meta.runtime = {
    ready: false,
    litPackages: {},
    topFrame: true,
    chromeTracks: true,
  };
  const {root} = await mount();
  expect(root.querySelector('.empty')).toBeNull();
});

const patched = {
  tagName: 'x-button',
  instances: 3,
  generation: 1,
  durationMs: 4.2,
  childState: 'transfer' as const,
  at: Date.now(),
};

/** Visible text of the latest-patch line with whitespace collapsed. */
const patchLine = (root: ShadowRoot): string | undefined =>
  root
    .querySelector('.hmr-last-patch')
    ?.textContent?.replace(/\s+/g, ' ')
    .trim();

test('shows no patch line until a patch has landed', async () => {
  const {root} = await mount();
  expect(root.querySelector('.hmr-last-patch')).toBeNull();
});

test('a pushed patch shows its line, and a later one replaces it', async () => {
  const {el, root} = await mount();
  push('hmr-patched', patched);
  await flush(el);
  expect(patchLine(root)).toContain(
    'Patched <x-button> ×3 in 4.2 ms (childState: transfer)'
  );
  push('hmr-patched', {...patched, tagName: 'x-card', instances: 1});
  await flush(el);
  expect(patchLine(root)).toContain('Patched <x-card> ×1 in 4.2 ms');
  expect(root.querySelectorAll('.hmr-last-patch')).toHaveLength(1);
});

test('primes the patch line from the history, skipping failures', async () => {
  answers.set('hmr-history', {
    entries: [
      {kind: 'patched', at: 1, patch: patched},
      {
        kind: 'incompatible',
        at: 2,
        incompatibility: {
          tagName: 'x-card',
          time: 2,
          reason: {code: 'attributes-changed'},
          action: 'none',
        },
      },
    ],
  });
  const {root} = await mount();
  expect(patchLine(root)).toContain('Patched <x-button> ×3');
});

test('a patch does not count toward the HMR issue badge', async () => {
  const {el} = await mount();
  push('hmr-patched', patched);
  await flush(el);
  expect(el.hmrIncompatibilityCount).toBe(0);
});

const splitOf = (root: ShadowRoot) =>
  root.querySelector<HTMLElement>('wa-split-panel')!;

test('the details pane starts at 340px and keeps its width on resize', async () => {
  const {root} = await mount();
  const split = splitOf(root);
  expect(split.getAttribute('position-in-pixels')).toBe('340');
  expect(split.getAttribute('primary')).toBe('end');
  expect(split.querySelector('[slot="end"]')!.classList).toContain('details');
});

test('restores a remembered details width and ignores a bad one', async () => {
  localStorage.setItem(WIDTH_LS_KEY, '412');
  const {root} = await mount();
  expect(splitOf(root).getAttribute('position-in-pixels')).toBe('412');
  document.body.replaceChildren();
  for (const bad of ['nope', '12', '-5', '']) {
    localStorage.setItem(WIDTH_LS_KEY, bad);
    const {root: r} = await mount();
    expect(splitOf(r).getAttribute('position-in-pixels')).toBe('340');
    document.body.replaceChildren();
  }
});

test('remembers the details width after a drag', async () => {
  const {root} = await mount();
  const split = splitOf(root) as HTMLElement & {positionInPixels: number};
  split.positionInPixels = 275;
  split.dispatchEvent(new Event('wa-reposition'));
  expect(localStorage.getItem(WIDTH_LS_KEY)).toBe('275');
});

test('a source location opens in the editor where the host has one', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {...detailsFor(), source: {file: 'src/b.ts', line: 4}},
  });
  await flush(el);
  expect(root.querySelector('button.src')!.textContent).toContain('src/b.ts:4');
});

test('a source location is plain text where the host has no editor', async () => {
  meta.capabilities.openInEditor = false;
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {...detailsFor(), source: {file: 'src/b.ts', line: 4}},
  });
  await flush(el);
  expect(root.querySelector('button.src')).toBeNull();
  expect(root.querySelector('.src-text')!.textContent).toBe('src/b.ts:4');
});

test('a sourcemapped location opens in the host viewer, even with no editor', async () => {
  meta.capabilities.openInEditor = false;
  const opened: unknown[] = [];
  useSourceOpener((loc) => void opened.push(loc));
  try {
    const {el, root} = await mount(true);
    const source = {
      file: 'src/b.ts',
      line: 4,
      column: 2,
      url: 'https://app.test/src/b.ts',
    };
    push('inspector-message', {type: 'pick', id: 2});
    push('inspector-message', {
      type: 'details',
      details: {...detailsFor(), source},
    });
    await flush(el);
    const link = root.querySelector<HTMLElement>('button.src')!;
    expect(link.textContent).toContain('src/b.ts:4');
    expect(link.dataset['tip']).toBe('Open in Sources');
    link.click();
    expect(opened).toEqual([source]);
    expect(calls.some((c) => c.name === 'open-source')).toBe(false);
  } finally {
    useSourceOpener(undefined);
  }
});

test('a file-only location opens in the host viewer where no editor can', async () => {
  meta.capabilities.openInEditor = false;
  const opened: unknown[] = [];
  useSourceOpener((loc) => void opened.push(loc));
  try {
    const {el, root} = await mount(true);
    const source = {file: '/app/src/b.ts', line: 4};
    const callSite = {file: '/app/src/app.ts', line: 12, column: 7};
    push('inspector-message', {type: 'pick', id: 2});
    push('inspector-message', {
      type: 'details',
      details: {...detailsFor(), source, callSite},
    });
    await flush(el);
    const defined = root.querySelector<HTMLElement>('button.src')!;
    expect(defined.dataset['tip']).toBe('Open in Sources');
    defined.click();
    root.querySelector<HTMLElement>('button.call-site')!.click();
    expect(opened).toEqual([source, callSite]);
    expect(calls.some((c) => c.name === 'open-source')).toBe(false);
  } finally {
    useSourceOpener(undefined);
  }
});

test('a file-only location stays in the editor where the host has one', async () => {
  const opened: unknown[] = [];
  useSourceOpener((loc) => void opened.push(loc));
  try {
    const {el, root} = await mount(true);
    answers.set('open-source', {opened: true});
    push('inspector-message', {type: 'pick', id: 2});
    push('inspector-message', {
      type: 'details',
      details: {...detailsFor(), source: {file: 'src/b.ts', line: 4}},
    });
    await flush(el);
    root.querySelector<HTMLElement>('button.src')!.click();
    await flush(el);
    expect(opened).toEqual([]);
    expect(calls.some((c) => c.name === 'open-source')).toBe(true);
  } finally {
    useSourceOpener(undefined);
  }
});

test('Reveal in Elements is absent without a host revealer', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor()});
  await flush(el);
  expect(root.querySelector('[aria-label="Reveal in Elements"]')).toBeNull();
});

test('Reveal in Elements calls the host revealer with the element id', async () => {
  const revealed: number[] = [];
  useElementRevealer((id) => void revealed.push(id));
  try {
    const {el, root} = await mount(true);
    push('inspector-message', {type: 'pick', id: 2});
    push('inspector-message', {type: 'details', details: detailsFor()});
    await flush(el);
    const button = root.querySelector<HTMLElement>(
      '[aria-label="Reveal in Elements"]'
    )!;
    expect(button.dataset['tip']).toBe('Reveal in the Elements panel');
    button.click();
    expect(revealed).toEqual([detailsFor().id]);
  } finally {
    useElementRevealer(undefined);
  }
});

describe('breakpoints', () => {
  const sets: Array<[number, BreakTarget, boolean]> = [];
  let clears = 0;
  let accept = true;
  afterEach(() => {
    useBreakpoints(undefined);
    sets.length = 0;
    clears = 0;
    accept = true;
  });

  const withProp = () => ({
    ...detailsFor(),
    properties: [
      {
        name: 'count',
        value: '1',
        type: 'number',
        attribute: 'count',
        reflects: false,
        state: false,
      },
    ],
  });

  const show = async (details: object = withProp()) => {
    const mounted = await mount(true);
    push('inspector-message', {type: 'pick', id: 2});
    push('inspector-message', {type: 'details', details});
    await flush(mounted.el);
    return mounted;
  };

  const host = () =>
    useBreakpoints({
      set: (...args) => {
        sets.push(args);
        return accept;
      },
      clear: () => void clears++,
    });

  test('are not offered by a host that cannot pause the page', async () => {
    const {root} = await show();
    expect(root.querySelector('.break')).toBeNull();
  });

  test('arm update(), render() and a property, and show which are on', async () => {
    host();
    const {el, root} = await show();
    const update = root.querySelector<HTMLElement>('.break-on .break')!;
    update.click();
    await flush(el);
    expect(sets).toEqual([[2, {kind: 'method', name: 'update'}, true]]);
    expect(update.getAttribute('aria-pressed')).toBe('true');

    root.querySelector<HTMLElement>('.entry .break')!.click();
    await flush(el);
    expect(sets[1]).toEqual([2, {kind: 'prop', name: 'count'}, true]);

    update.click();
    await flush(el);
    expect(sets[2]).toEqual([2, {kind: 'method', name: 'update'}, false]);
    expect(update.getAttribute('aria-pressed')).toBe('false');
  });

  test('stay off when the page refuses one', async () => {
    host();
    accept = false;
    const {el, root} = await show();
    const toggle = root.querySelector<HTMLElement>('.entry .break')!;
    toggle.click();
    await flush(el);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  test('are cleared in the page when the selection moves', async () => {
    host();
    const {el, root} = await show();
    root.querySelector<HTMLElement>('.break-on .break')!.click();
    await flush(el);
    push('inspector-message', {type: 'pick', id: 1});
    push('inspector-message', {
      type: 'details',
      details: {...withProp(), id: 1, tagName: 'x-app'},
    });
    await flush(el);
    expect(clears).toBe(1);
    expect(root.querySelector('.break[aria-pressed="true"]')).toBeNull();
  });

  test('have no line for an element without Lit state', async () => {
    host();
    const {root} = await show({...withProp(), notLit: true});
    expect(root.querySelector('.break-on')).toBeNull();
  });
});

test('a location with a url but no host viewer stays plain text', async () => {
  meta.capabilities.openInEditor = false;
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      source: {file: 'src/b.ts', line: 4, url: 'https://app.test/src/b.ts'},
    },
  });
  await flush(el);
  expect(root.querySelector('button.src')).toBeNull();
  expect(root.querySelector('.src-text')!.textContent).toBe('src/b.ts:4');
});

test('a call site renders a second link that opens at its column', async () => {
  const {el, root} = await mount(true);
  answers.set('open-source', {opened: true});
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      source: {file: 'src/b.ts', line: 4},
      callSite: {file: 'src/app.ts', line: 12, column: 7},
    },
  });
  await flush(el);
  const link = root.querySelector<HTMLElement>('button.call-site')!;
  expect(link.textContent).toContain('src/app.ts:12');
  link.click();
  await flush(el);
  expect(calls.find((c) => c.name === 'open-source')?.args).toEqual([
    {file: 'src/app.ts', line: 12, column: 7},
  ]);
});

test('a call site is plain text where the host has no editor', async () => {
  meta.capabilities.openInEditor = false;
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      callSite: {file: 'src/app.ts', line: 12, column: 7},
    },
  });
  await flush(el);
  expect(root.querySelector('button.call-site')).toBeNull();
  expect(root.querySelector('.call-site')!.textContent).toBe('src/app.ts:12');
});

test('no call site, no row', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {...detailsFor(), source: {file: 'src/b.ts', line: 4}},
  });
  await flush(el);
  expect(root.querySelector('.call-site')).toBeNull();
});

test('badges a component Lit warned about and lists the warning', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      warnings: [
        {
          code: 'change-in-update',
          message: 'Element x-button scheduled an update after an update.',
        },
      ],
    },
  });
  await flush(el);
  expect(root.querySelector('.details .head .status.warned')?.textContent).toBe(
    '1 warning'
  );
  expect(sections(root)).toEqual(['Warnings 1 open']);
  const code = root.querySelector<HTMLAnchorElement>('.details .warning .code');
  expect(code?.textContent).toBe('change-in-update');
  expect(code?.href).toBe('https://lit.dev/msg/change-in-update');
  expect(root.querySelector('.details .warning .text')?.textContent).toContain(
    'x-button scheduled'
  );
});

/** Ticks 1..n of element 2, each after the first scheduled by the one before. */
const rerenderedTicks = (n: number): TimelineEvent[] =>
  Array.from({length: n}, (_, i) => ({
    layerId: 'lit-lifecycle',
    time: i * 10,
    groupId: `2:${i + 1}`,
    title: 'performUpdate:start',
    data: {},
    meta: {elementId: 2, tagName: 'x-button'},
    ...(i === 0 ? {} : {cause: {kind: 'update' as const, groupId: `2:${i}`}}),
  }));

/**
 * Picks element 2 and shows `warnings`, then records `ticks` of it: the
 * section has to follow a recording that arrives while it is open.
 */
const showRerendered = async (ticks: number, warnings?: InspectorWarning[]) => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {...detailsFor(), ...(warnings ? {warnings} : {})},
  });
  await flush(el);
  setEvents(rerenderedTicks(ticks));
  await flush(el);
  return root;
};

test('warns when the recording shows the element re-rendering itself', async () => {
  const root = await showRerendered(3);
  expect(sections(root)).toEqual(['Warnings 1 open']);
  expect(
    root.querySelector('.details .warning.self-caused')?.textContent
  ).toContain('Re-rendered itself 2 times');
});

test("adds the recorded count to Lit's change-in-update warning", async () => {
  const root = await showRerendered(2, [
    {
      code: 'change-in-update',
      message: 'Element x-button scheduled an update after an update.',
    },
  ]);
  expect(sections(root)).toEqual(['Warnings 1 open']);
  expect(root.querySelectorAll('.details .warning')).toHaveLength(1);
  expect(
    root.querySelector('.details .warning .self-caused')?.textContent
  ).toContain('Re-rendered itself once');
});

test('counts the events the element dispatched in the recording', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor()});
  await flush(el);
  expect(sections(root)).toEqual([]);
  const dispatch = (type: string, time: number): TimelineEvent => ({
    layerId: 'custom-events',
    time,
    title: type,
    data: {type},
    meta: {elementId: 2, tagName: 'x-button'},
  });
  setEvents([dispatch('press', 0), dispatch('press', 1), dispatch('focus', 2)]);
  await flush(el);
  expect(sections(root)).toEqual(['Dispatched 2 open']);
  const entries = [...root.querySelectorAll('.details .dispatched .entry')].map(
    (e) => e.textContent!.replace(/\s+/g, ' ').trim()
  );
  expect(entries).toEqual(['press ×2', 'focus ×1']);
});

test('shows no warning badge or section without warnings', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: detailsFor()});
  await flush(el);
  expect(root.querySelector('.details .status.warned')).toBeNull();
  expect(sections(root)).toEqual([]);
});

test('marks an element that was never upgraded, in its row and details', async () => {
  const {el, root, rows} = await mount(true, [
    {id: 2, tagName: 'x-button', notUpgraded: true, children: []},
  ]);
  expect(rows()[0]!.querySelector('.status.not-upgraded')?.textContent).toBe(
    'not upgraded'
  );
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {...detailsFor(), notUpgraded: true},
  });
  await flush(el);
  const head = root.querySelector('.details .head')!;
  expect(head.querySelector('.status.not-upgraded')).not.toBeNull();
  expect(head.querySelector('[data-action="request-update"]')).toBeNull();
  expect(root.querySelector('.not-defined-note')?.textContent).toContain(
    'never upgraded'
  );
});

test('an element that never upgraded gets no hydration pill, server HTML or not', async () => {
  const {el, root, rows} = await mount(true, [
    {
      id: 1,
      tagName: 'wa-icon',
      notUpgraded: true,
      ssr: 'pending',
      children: [],
    },
    {id: 2, tagName: 'x-plain', notUpgraded: true, children: []},
  ]);
  const [served, plain] = rows();
  expect(served!.querySelector('wa-badge.ssr')).toBeNull();
  // Never hydrating is covered by the one chip, which says why.
  const chip = served!.querySelector('.status.not-upgraded')!;
  expect(chip.getAttribute('data-tip')).toContain(
    'still shows the HTML the server sent'
  );
  expect(
    plain!.querySelector('.status.not-upgraded')!.getAttribute('data-tip')
  ).not.toContain('server');

  push('inspector-message', {type: 'pick', id: 1});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      id: 1,
      tagName: 'wa-icon',
      notUpgraded: true,
      ssr: 'pending',
      properties: [],
      flags: {hasUpdated: false, isUpdatePending: false, hasShadowRoot: true},
    },
  });
  await flush(el);
  const head = root.querySelector('.details .head')!;
  expect(head.querySelector('wa-badge.ssr')).toBeNull();
  expect(head.querySelector('.status.not-upgraded')).not.toBeNull();
  expect(root.querySelector('.not-defined-note')?.textContent).toContain(
    'will not hydrate'
  );
});

test('marks server-rendered elements by where hydration stands', async () => {
  const {el, root, rows} = await mount(true, [
    {id: 1, tagName: 'x-app', ssr: 'deferred', children: []},
    {id: 2, tagName: 'x-button', ssr: 'hydrated', children: []},
  ]);
  expect(
    rows().map((r) => r.querySelector('wa-badge.ssr')?.textContent)
  ).toEqual(['deferred', 'hydrated']);
  expect(
    rows().map((r) =>
      r.querySelector('wa-badge.ssr wa-icon')?.getAttribute('name')
    )
  ).toEqual(['drop-simple', 'drop-simple-fill']);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      ssr: 'pending',
      flags: {hasUpdated: false, isUpdatePending: false, hasShadowRoot: true},
    },
  });
  await flush(el);
  const head = root.querySelector('.details .head')!;
  expect(head.querySelector('wa-badge.ssr')?.textContent).toBe('not hydrated');
  expect(head.querySelector('wa-badge.ssr wa-icon')?.getAttribute('name')).toBe(
    'drop-simple'
  );
  // The server rendered it; "not rendered" would be wrong.
  expect(head.textContent).not.toContain('not rendered');
});

test('marks a tag nothing defines in its row', async () => {
  const {rows} = await mount(false, [
    {id: 1, tagName: 'x-app', children: []},
    {id: 2, tagName: 'x-missing', notDefined: true, children: []},
  ]);
  const [app, missing] = rows();
  expect(app!.querySelector('.status.undefined')).toBeNull();
  expect(missing!.querySelector('.status.undefined')?.textContent).toBe(
    'not defined'
  );
});

test('marks warned rows and reports the distinct warned tag count', async () => {
  const counts: number[] = [];
  const onCount = (e: Event) =>
    counts.push((e as CustomEvent<{count: number}>).detail.count);
  document.addEventListener('warning-count-change', onCount);
  try {
    const {rows} = await mount(false, [
      {id: 1, tagName: 'x-app', warnings: 2, children: []},
      {id: 2, tagName: 'x-item', warnings: 1, children: []},
      {id: 3, tagName: 'x-item', warnings: 1, children: []},
      {id: 4, tagName: 'x-quiet', children: []},
    ]);
    const chips = rows().map((r) => r.querySelector('.status.warned'));
    expect(chips[0]?.textContent?.trim()).toBe('2 warnings');
    expect(chips[0]?.getAttribute('data-tip')).toBe(
      '2 Lit warnings — select to read them'
    );
    expect(chips[1]?.textContent?.trim()).toBe('1 warning');
    expect(chips[3]).toBeNull();
    // x-app and x-item: two instances of x-item count once.
    expect(counts.at(-1)).toBe(2);
  } finally {
    document.removeEventListener('warning-count-change', onCount);
  }
});

test('explains an undefined element in the details pane', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      tagName: 'x-missing',
      notDefined: true,
      callSite: {file: 'src/app.ts', line: 12},
      flags: {hasUpdated: false, isUpdatePending: false, hasShadowRoot: false},
    },
  });
  await flush(el);
  expect(
    root.querySelector('.details .head .status.undefined')?.textContent
  ).toBe('not defined');
  // An element that never upgraded has not "failed to render".
  expect(
    root.querySelector('.details .head .status:not(.undefined)')
  ).toBeNull();
  expect(root.querySelector('.not-defined-note')?.textContent).toContain(
    "customElements.define('x-missing')"
  );
  expect(root.querySelector('.call-site')?.textContent).toContain(
    'src/app.ts:12'
  );
  expect(sections(root)).toEqual([]);
});

test('leaves a custom element another library defined unmarked', async () => {
  const {rows} = await mount(false, [
    {id: 2, tagName: 'x-plain', notLit: true, children: []},
  ]);
  expect(rows()[0]!.querySelector('.status')).toBeNull();
});

test('explains a non-Lit element in the details pane', async () => {
  const {el, root} = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      tagName: 'x-plain',
      notLit: true,
      attributes: [{name: 'variant', value: 'brand'}],
      properties: [],
      flags: {hasUpdated: false, isUpdatePending: false, hasShadowRoot: true},
    },
  });
  await flush(el);
  // It never runs a Lit update, so "not rendered" would be wrong.
  expect(root.querySelector('.details .head .status')).toBeNull();
  expect(root.querySelector('.not-defined-note')?.textContent).toContain(
    'not as a Lit component'
  );
  expect(sections(root)).toEqual(['Attributes 1 open']);
});

const buttonDocs = {
  tagName: 'x-button',
  className: 'XButton',
  summary: 'A button.',
  description: 'Fires x-press when pressed.',
  properties: [{name: 'label', description: 'The visible text'}],
  attributes: [],
  events: [{name: 'x-press', type: 'CustomEvent', description: 'On press'}],
  slots: [],
  cssParts: [],
  cssProperties: [
    {name: '--x-button-gap', description: 'Icon spacing', default: '4px'},
  ],
  cssStates: [],
  origin: {package: '@x/ui', manifest: 'custom-elements.json', module: 'x.js'},
};

const pickButton = async (el: ComponentsView) => {
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      properties: [
        {
          name: 'label',
          value: '"Save"',
          type: 'string',
          attribute: 'label',
          reflects: false,
          state: false,
        },
      ],
    },
  });
  await flush(el);
};

test("shows the manifest's docs for the selected tag", async () => {
  answers.set('component-docs', () => ({docs: buttonDocs}));
  const {el, root} = await mount(true);
  await pickButton(el);
  const details = root.querySelector('.details')!;
  expect(
    [...details.querySelectorAll('.label')].map((l) => l.textContent)
  ).toEqual(['About', 'Properties', 'Events', 'CSS properties']);
  expect(
    [...details.querySelectorAll('.about p')].map((p) => p.textContent)
  ).toEqual(['A button.', 'Fires x-press when pressed.']);
  // The source is a quiet icon in the heading, its origin in the tooltip;
  // the section has no count.
  const about = details.querySelector('[data-section="About"] summary')!;
  expect(about.querySelector('.count')).toBeNull();
  // A button of its own beside the summary, so keyboard focus reaches it.
  const origin = details.querySelector<HTMLElement>(
    '[data-section="About"] > button.origin'
  )!;
  expect(origin.getAttribute('data-tip')).toBe(
    'From @x/ui, custom-elements.json'
  );
  expect(about.contains(origin)).toBe(false);
  // A documented property carries its description as the tooltip.
  expect(details.querySelector('.described')!.getAttribute('data-tip')).toBe(
    'The visible text'
  );
  const docRow = (key: string) =>
    details
      .querySelector(`[data-key="${key}"]`)!
      .textContent!.replace(/\s+/g, ' ')
      .trim();
  expect(docRow('event:x-press')).toBe('x-pressCustomEvent On press');
  expect(docRow('cssprop:--x-button-gap')).toBe(
    '--x-button-gap Icon spacing 4px'
  );
  expect(
    calls.filter((c) => c.name === 'component-docs').map((c) => c.args[0])
  ).toEqual([{tagName: 'x-button'}]);
});

test('names the source module for docs read from source', async () => {
  answers.set('component-docs', () => ({
    docs: {
      ...buttonDocs,
      origin: {manifest: '', module: 'src/x-button.ts', source: true},
    },
  }));
  const {el, root} = await mount(true);
  await pickButton(el);
  const origin = root.querySelector('.details .section > .origin')!;
  expect(origin.getAttribute('data-tip')).toBe('From src/x-button.ts');
  expect(origin.querySelector('wa-icon')!.getAttribute('name')).toBe(
    'file-code'
  );
});

test('a hot patch of the selected tag asks for its docs again', async () => {
  let summary = 'A button.';
  answers.set('component-docs', () => ({docs: {...buttonDocs, summary}}));
  const {el, root} = await mount(true);
  await pickButton(el);
  const about = () =>
    root.querySelector('.details .about p')?.textContent ?? null;
  expect(about()).toBe('A button.');
  summary = 'A pressable button.';
  // Another tag's patch leaves the docs alone.
  push('hmr-patched', {...patched, tagName: 'x-card'});
  await flush(el);
  expect(calls.filter((c) => c.name === 'component-docs')).toHaveLength(1);
  push('hmr-patched', patched);
  await flush(el);
  await flush(el);
  expect(calls.filter((c) => c.name === 'component-docs')).toHaveLength(2);
  expect(about()).toBe('A pressable button.');
});

test('a changed manifest asks for the docs on show again', async () => {
  let summary = 'A button.';
  answers.set('component-docs', () => ({docs: {...buttonDocs, summary}}));
  const {el, root} = await mount(true);
  await pickButton(el);
  summary = 'A regenerated button.';
  push('component-docs-changed');
  await flush(el);
  await flush(el);
  expect(calls.filter((c) => c.name === 'component-docs')).toHaveLength(2);
  expect(root.querySelector('.details .about p')?.textContent).toBe(
    'A regenerated button.'
  );
});

test('asks for no docs where the host cannot read manifests', async () => {
  meta.capabilities.componentDocs = false;
  answers.set('component-docs', () => ({docs: buttonDocs}));
  const {el, root} = await mount(true);
  await pickButton(el);
  expect(calls.some((c) => c.name === 'component-docs')).toBe(false);
  expect(root.querySelector('.details .about')).toBeNull();
});

test('the row filter reaches the docs', async () => {
  answers.set('component-docs', () => ({docs: buttonDocs}));
  const {el, root} = await mount(true);
  await pickButton(el);
  const filter = root.querySelector<HTMLInputElement & {value: string}>(
    '.details wa-input.filter'
  )!;
  filter.value = 'spacing';
  filter.dispatchEvent(new Event('input'));
  await flush(el);
  expect(
    [...root.querySelectorAll('.details .label')].map((l) => l.textContent)
  ).toEqual(['CSS properties']);
});

test('About and doc rows render their markdown', async () => {
  answers.set('component-docs', () => ({
    docs: {
      ...buttonDocs,
      summary: undefined,
      description:
        'Presses a `Set` of things,\nwrapped by hand. See [the guide](javascript:alert(1)).',
      events: [{name: 'x-press', description: 'Fires with `detail`.'}],
    },
  }));
  const {el, root} = await mount(true);
  await pickButton(el);
  const about = root.querySelector('.details .about')!;
  expect(about.querySelector('code')!.textContent).toBe('Set');
  expect(about.textContent!.replace(/\s+/g, ' ')).toContain(
    'of things, wrapped by hand. See the guide.'
  );
  expect(about.querySelector('a')).toBeNull();
  const row = root.querySelector('.details [data-key="event:x-press"] .val')!;
  expect(row.querySelector('code')!.textContent).toBe('detail');
  expect(row.querySelector('p')).toBeNull();
});

test('the row filter marks a word inside rendered prose', async () => {
  answers.set('component-docs', () => ({
    docs: {
      ...buttonDocs,
      summary: undefined,
      description: 'A `Set` of **bold** things.',
    },
  }));
  const {el, root} = await mount(true);
  await pickButton(el);
  const filter = root.querySelector<HTMLInputElement & {value: string}>(
    '.details wa-input.filter'
  )!;
  filter.value = 'bold';
  filter.dispatchEvent(new Event('input'));
  await flush(el);
  expect(root.querySelector('.details .about strong mark')!.textContent).toBe(
    'bold'
  );
  // The filter matches what is shown, not the markup around it.
  filter.value = '**';
  filter.dispatchEvent(new Event('input'));
  await flush(el);
  expect(root.querySelector('.details .about')).toBeNull();
});

test('About shows @examples as code blocks, under their captions', async () => {
  answers.set('component-docs', () => ({
    docs: {
      ...buttonDocs,
      examples: [
        {caption: 'Basic', code: '<x-button>\n  Save\n</x-button>'},
        {code: 'Use it:\n\n```html\n<x-button></x-button>\n```'},
      ],
    },
  }));
  const {el, root} = await mount(true);
  await pickButton(el);
  const examples = [...root.querySelectorAll('.details .about .example')];
  expect(examples.map((e) => e.querySelector('.caption')?.textContent)).toEqual(
    ['Basic', undefined]
  );
  expect(examples[0]!.querySelector('pre code')!.textContent).toBe(
    '<x-button>\n  Save\n</x-button>'
  );
  // An example holding a fence renders as markdown.
  expect(examples[1]!.querySelector('p')!.textContent).toBe('Use it:');
  expect(examples[1]!.querySelector('pre code')!.textContent).toBe(
    '<x-button></x-button>'
  );
});

/** A button whose manifest documents its default slot and its `base` part. */
const showDocumentedAnatomy = async (el: ComponentsView) => {
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      anatomy: {
        renderRoot: 'shadow',
        mode: 'open',
        slots: [
          {
            name: '',
            status: 'assigned',
            elements: [{tagName: 'span'}],
            moreElements: 0,
            textNodes: 0,
            forwarded: false,
            duplicate: false,
          },
        ],
        orphans: [],
        orphanText: 0,
        parts: [{names: ['base', 'control'], tagName: 'div'}],
      },
    },
  });
  await flush(el);
};

const documentedAnatomy = () =>
  answers.set('component-docs', () => ({
    docs: {
      ...buttonDocs,
      slots: [{name: '', description: 'The label'}],
      cssParts: [{name: 'base', description: 'The wrapper'}],
    },
  }));

test('slots and parts take their manifest descriptions as tooltips', async () => {
  documentedAnatomy();
  const {el, root} = await mount(true);
  await showDocumentedAnatomy(el);
  const tips = [...root.querySelectorAll('.details .described')].map((d) => [
    d.textContent!.trim(),
    d.getAttribute('data-tip'),
  ]);
  expect(tips).toEqual([
    ['default', 'The label'],
    ['base control', 'The wrapper'],
  ]);
  expect(root.querySelector('.details .doc-line')).toBeNull();
});

test('inline descriptions put each description under its row', async () => {
  documentedAnatomy();
  overrides.set('inlineDocs', true);
  try {
    const {el, root} = await mount(true);
    await showDocumentedAnatomy(el);
    const lines = [...root.querySelectorAll('.details .entry .doc-line')].map(
      (d) => d.textContent!.trim()
    );
    expect(lines).toEqual(['The label', 'The wrapper']);
    expect(root.querySelector('.details .described')).toBeNull();
  } finally {
    overrides.set('inlineDocs', false);
  }
});

test('long About text starts clamped and opens with more', async () => {
  answers.set('component-docs', () => ({
    docs: {...buttonDocs, summary: undefined, description: 'x'.repeat(400)},
  }));
  const {el, root} = await mount(true);
  await pickButton(el);
  const text = () => root.querySelector('.details .about .prose')!;
  const more = () =>
    root.querySelector<HTMLButtonElement>('.details .about .more')!;
  expect(text().classList.contains('clamped')).toBe(true);
  more().click();
  await flush(el);
  expect(text().classList.contains('clamped')).toBe(false);
  expect(more().textContent!.trim()).toBe('less');
});

const settable = () => ({
  ...detailsFor(),
  properties: [
    {
      name: 'disabled',
      value: 'false',
      type: 'boolean',
      attribute: 'disabled',
      reflects: false,
      state: false,
      editable: 'boolean' as const,
    },
    {
      name: 'count',
      value: '3',
      type: 'number',
      attribute: 'count',
      reflects: false,
      state: false,
      editable: 'number' as const,
    },
    {
      name: 'label',
      value: '"Save"',
      type: 'string',
      attribute: 'label',
      reflects: false,
      state: false,
      editable: 'string' as const,
    },
    {
      name: 'long',
      value: '"abc…',
      type: 'string',
      attribute: false as const,
      reflects: false,
      state: false,
      editable: 'string' as const,
    },
    {
      name: 'config',
      value: '{a: 1}',
      type: 'object',
      attribute: false as const,
      reflects: false,
      state: false,
    },
  ],
});

const mountSettable = async () => {
  const mounted = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: settable()});
  await flush(mounted.el);
  const row = (name: string) =>
    mounted.root.querySelector<HTMLElement>(
      `.details .entry[data-key="p:${name}"]`
    )!;
  const sets = () =>
    mounted.inspects().filter((c) => (c as {type: string}).type === 'set-prop');
  return {...mounted, row, sets};
};

test('a boolean flips from its row', async () => {
  const {el, row, sets} = await mountSettable();
  const button = row('disabled').querySelector<HTMLElement>('button.edit')!;
  expect(button.getAttribute('aria-label')).toBe('Set to true');
  button.click();
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'disabled', value: true},
  ]);
});

test('a number is typed over, and Enter sends it parsed', async () => {
  const {el, row, sets} = await mountSettable();
  row('count').querySelector<HTMLElement>('button.edit')!.click();
  await flush(el);
  const input = row('count').querySelector<HTMLInputElement>('.edit-input')!;
  expect(input.value).toBe('3');
  input.value = '';
  input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
  await flush(el);
  // Nothing to send for an empty number: it stays open and says so.
  expect(sets()).toEqual([]);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  input.value = '12.5';
  input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'count', value: 12.5},
  ]);
  expect(row('count').querySelector('.edit-input')).toBeNull();
});

test('a string starts from its text, not its quoted preview', async () => {
  const {el, row, sets} = await mountSettable();
  row('label').querySelector<HTMLElement>('button.edit')!.click();
  await flush(el);
  const input = row('label').querySelector<HTMLInputElement>('.edit-input')!;
  expect(input.value).toBe('Save');
  input.value = 'Send';
  input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'label', value: 'Send'},
  ]);
});

test('Escape sends nothing and returns to the edit button', async () => {
  const {el, row, sets} = await mountSettable();
  row('label').querySelector<HTMLElement>('button.edit')!.click();
  await flush(el);
  const input = row('label').querySelector<HTMLInputElement>('.edit-input')!;
  input.value = 'Send';
  input.dispatchEvent(
    new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})
  );
  await flush(el);
  expect(row('label').querySelector('.edit-input')).toBeNull();
  expect(sets()).toEqual([]);
  expect(el.shadowRoot!.activeElement).toBe(
    row('label').querySelector('button.edit')
  );
});

test('only a whole primitive can be edited, and not in a snapshot', async () => {
  const {row} = await mountSettable();
  // A truncated string is not the value; an object is not a primitive.
  expect(row('long').querySelector('button.edit')).toBeNull();
  expect(row('config').querySelector('button.edit')).toBeNull();

  document.body.replaceChildren();
  setSnapshot(true);
  const frozen = await mountSettable();
  expect(frozen.root.querySelector('.details button.edit')).toBeNull();
});

const leafPath = () => ({section: 'prop' as const, name: 'config', keys: []});

const mountLeaves = async (section: 'prop' | 'extra' = 'prop') => {
  const mounted = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  const details = expandable();
  push('inspector-message', {
    type: 'details',
    details:
      section === 'prop'
        ? details
        : {
            ...details,
            extras: [
              {
                name: 'cache',
                kind: 'field',
                value: '{a: 1}',
                type: 'object',
                expandable: true,
              },
            ],
          },
  });
  await flush(mounted.el);
  const path =
    section === 'prop' ? leafPath() : {...leafPath(), section, name: 'cache'};
  const first = mounted.root.querySelector<HTMLElement>(
    section === 'prop'
      ? '.details .entry[data-key="p:config"] .expander'
      : '.details .entry[data-key="e:cache"] .expander'
  )!;
  first.click();
  await flush(mounted.el);
  push('inspector-message', {
    type: 'expanded',
    id: 2,
    path,
    children: [
      {
        label: 'name',
        key: 'name',
        value: '"Ada"',
        type: 'string',
        expandable: false,
        editable: 'string',
      },
      {
        label: 'on',
        key: 'on',
        value: 'true',
        type: 'boolean',
        expandable: false,
        editable: 'boolean',
      },
    ],
  });
  await flush(mounted.el);
  const child = (label: string) =>
    [...mounted.root.querySelectorAll<HTMLElement>('.details .child')].find(
      (c) => c.querySelector('.t-key')?.textContent === label
    )!;
  const sets = () =>
    mounted.inspects().filter((c) => (c as {type: string}).type === 'set-prop');
  return {...mounted, child, sets};
};

test('a leaf inside an expanded prop is typed over and sent with its keys', async () => {
  const {el, child, sets} = await mountLeaves();
  child('name').querySelector<HTMLElement>('button.edit')!.click();
  await flush(el);
  const input = child('name').querySelector<HTMLInputElement>('.edit-input')!;
  expect(input.value).toBe('Ada');
  expect(input.getAttribute('aria-label')).toBe('Value of config.name');
  input.value = 'Grace';
  input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'config', value: 'Grace', keys: ['name']},
  ]);
  expect(child('name').querySelector('.edit-input')).toBeNull();
});

test('a boolean leaf flips on a click', async () => {
  const {el, child, sets} = await mountLeaves();
  const button = child('on').querySelector<HTMLElement>('button.edit')!;
  expect(button.getAttribute('aria-label')).toBe('Set to false');
  button.click();
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'config', value: false, keys: ['on']},
  ]);
});

test('Escape on a leaf returns focus to its edit button', async () => {
  const {el, child, sets} = await mountLeaves();
  child('name').querySelector<HTMLElement>('button.edit')!.click();
  await flush(el);
  child('name')
    .querySelector<HTMLInputElement>('.edit-input')!
    .dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})
    );
  await flush(el);
  expect(sets()).toEqual([]);
  expect(el.shadowRoot!.activeElement).toBe(
    child('name').querySelector('button.edit')
  );
});

test("an extra's children are read-only", async () => {
  const {root} = await mountLeaves('extra');
  expect(root.querySelectorAll('.details .child')).toHaveLength(2);
  expect(root.querySelector('.details .child button.edit')).toBeNull();
});

test('a snapshot opens no levels, so no leaf can be edited', async () => {
  document.body.replaceChildren();
  setSnapshot(true);
  const mounted = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: expandable()});
  await flush(mounted.el);
  expect(mounted.root.querySelector('.details .expander')).toBeNull();
  expect(mounted.root.querySelector('.details button.edit')).toBeNull();
});

const dblclick = (el: Element) =>
  el.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, composed: true}));

test('the edit button sits inside the value, top-level and leaf', async () => {
  const {row} = await mountSettable();
  expect(row('count').querySelector('.val > button.edit')).not.toBeNull();
  const {child} = await mountLeaves();
  expect(child('name').querySelector('.t-value > button.edit')).not.toBeNull();
});

test('double-clicking a boolean value flips it', async () => {
  const {el, row, sets} = await mountSettable();
  dblclick(row('disabled').querySelector('.val')!);
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'disabled', value: true},
  ]);
});

test('double-clicking a number value opens the input', async () => {
  const {el, row, sets} = await mountSettable();
  dblclick(row('count').querySelector('.val')!);
  await flush(el);
  expect(row('count').querySelector('.edit-input')).not.toBeNull();
  expect(sets()).toEqual([]);
});

test('double-clicking a leaf value does what its button does', async () => {
  const {el, child, sets} = await mountLeaves();
  dblclick(child('on').querySelector('.t-value')!);
  await flush(el);
  expect(sets()).toEqual([
    {type: 'set-prop', id: 2, name: 'config', value: false, keys: ['on']},
  ]);
  dblclick(child('name').querySelector('.t-value')!);
  await flush(el);
  expect(child('name').querySelector('.edit-input')).not.toBeNull();
});

test('double-clicking the edit button itself does not edit twice', async () => {
  const {el, row, sets} = await mountSettable();
  dblclick(row('disabled').querySelector('button.edit')!);
  await flush(el);
  expect(sets()).toEqual([]);
});

test('double-clicking a value that cannot be edited does nothing', async () => {
  const {el, row, sets} = await mountSettable();
  dblclick(row('config').querySelector('.val')!);
  dblclick(row('long').querySelector('.val')!);
  await flush(el);
  expect(sets()).toEqual([]);
  expect(row('config').querySelector('.edit-input')).toBeNull();
  expect(row('long').querySelector('.edit-input')).toBeNull();
});

test('a snapshot ignores a double-click on a value', async () => {
  document.body.replaceChildren();
  setSnapshot(true);
  const {el, row, sets} = await mountSettable();
  dblclick(row('disabled').querySelector('.val')!);
  dblclick(row('count').querySelector('.val')!);
  await flush(el);
  expect(sets()).toEqual([]);
  expect(el.shadowRoot!.querySelector('.edit-input')).toBeNull();
});

const overridden = (enabled: boolean) => ({
  ...detailsFor(),
  properties: [
    {
      name: 'label',
      value: enabled ? '"Send"' : '"Save"',
      type: 'string',
      attribute: 'label',
      reflects: false,
      state: false,
      editable: 'string' as const,
      override: {value: '"Send"', enabled, intrinsic: '"Save"'},
    },
  ],
});

const mountOverridden = async (enabled = true) => {
  const mounted = await mount(true);
  push('inspector-message', {type: 'pick', id: 2});
  push('inspector-message', {type: 'details', details: overridden(enabled)});
  await flush(mounted.el);
  const row = () =>
    mounted.root.querySelector<HTMLElement>(
      '.details .entry[data-key="p:label"]'
    )!;
  const sent = (type: string) =>
    mounted.inspects().filter((c) => (c as {type: string}).type === type);
  return {...mounted, row, sent};
};

test('an overridden row strikes the intrinsic value and can be switched off', async () => {
  const {el, row, sent} = await mountOverridden();
  expect(row().classList.contains('overridden')).toBe(true);
  expect(row().querySelector('.shadowed')!.textContent).toBe('"Save"');
  const toggle = row().querySelector<HTMLInputElement>('.override-toggle')!;
  expect(toggle.checked).toBe(true);
  toggle.click();
  await flush(el);
  expect(sent('override-toggle')).toEqual([
    {type: 'override-toggle', id: 2, name: 'label', enabled: false},
  ]);
});

test('a switched-off override is what gets struck through', async () => {
  const {row} = await mountOverridden(false);
  expect(row().querySelector('.shadowed')!.textContent).toBe('"Send"');
  expect(
    row().querySelector<HTMLInputElement>('.override-toggle')!.checked
  ).toBe(false);
});

test('an override is removed from its row', async () => {
  const {el, row, sent} = await mountOverridden();
  row().querySelector<HTMLElement>('.remove-override')!.click();
  await flush(el);
  expect(sent('override-remove')).toEqual([
    {type: 'override-remove', id: 2, name: 'label'},
  ]);
});

test('the overrides bar shows while the page has overrides', async () => {
  const {el, root, sent} = await mountOverridden();
  const bar = () => root.querySelector<HTMLElement>('.overrides-bar');
  expect(bar()).toBeNull();
  expect(sent('overrides').length).toBeGreaterThan(0);
  push('inspector-message', {
    type: 'overrides',
    applied: true,
    entries: [
      {
        id: 2,
        tagName: 'x-button',
        name: 'label',
        value: '"Send"',
        enabled: true,
      },
      {id: 1, tagName: 'x-app', name: 'open', value: 'true', enabled: false},
    ],
  });
  await flush(el);
  expect(bar()!.querySelector('summary')!.textContent!.trim()).toBe(
    '2 overrides'
  );
  const items = [...bar()!.querySelectorAll('.overrides-list li')];
  expect(items[1]!.classList.contains('off')).toBe(true);

  items[1]!.querySelector<HTMLElement>('.remove-override')!.click();
  items[1]!.querySelector<HTMLElement>('.tag')!.click();
  await flush(el);
  expect(sent('override-remove')).toEqual([
    {type: 'override-remove', id: 1, name: 'open'},
  ]);
  expect(el.location.selected('components')).toBe(1);

  const toggle = bar()!.querySelector('wa-switch')!;
  (toggle as HTMLElement & {checked: boolean}).checked = false;
  toggle.dispatchEvent(new Event('change'));
  bar()!.querySelector<HTMLElement>('.clear-overrides')!.click();
  await flush(el);
  expect(sent('overrides-apply')).toEqual([
    {type: 'overrides-apply', applied: false},
  ]);
  expect(sent('overrides-clear')).toEqual([{type: 'overrides-clear'}]);

  push('inspector-message', {type: 'overrides', applied: true, entries: []});
  await flush(el);
  expect(bar()).toBeNull();
});

test('a leaf override is switched and removed from its row', async () => {
  const {el, root, inspects} = await mountOverridden();
  const sent = (type: string) =>
    inspects().filter((c) => (c as {type: string}).type === type);
  push('inspector-message', {
    type: 'details',
    details: {
      ...detailsFor(),
      properties: [
        {
          name: 'cfg',
          value: '{mode: "dark"}',
          type: 'object',
          attribute: false as const,
          reflects: false,
          state: false,
          expandable: true,
        },
      ],
    },
  });
  await flush(el);
  root
    .querySelector<HTMLElement>('.entry[data-key="p:cfg"] .expander')!
    .click();
  push('inspector-message', {
    type: 'expanded',
    id: 2,
    path: {section: 'prop', name: 'cfg', keys: []},
    children: [
      {
        label: 'mode',
        key: 'mode',
        entry: false,
        value: '"dark"',
        type: 'string',
        expandable: false,
        editable: 'string',
        override: {value: '"dark"', enabled: true, intrinsic: '"light"'},
      },
    ],
  });
  await flush(el);
  const child = root.querySelector<HTMLElement>('.child')!;
  expect(child.querySelector('.shadowed')!.textContent).toBe('"light"');
  const toggle = child.querySelector<HTMLInputElement>('.override-toggle')!;
  expect(toggle.getAttribute('aria-label')).toBe('Override cfg.mode');
  toggle.click();
  child.querySelector<HTMLElement>('.remove-override')!.click();
  await flush(el);
  expect(sent('override-toggle')).toEqual([
    {
      type: 'override-toggle',
      id: 2,
      name: 'cfg',
      keys: ['mode'],
      enabled: false,
    },
  ]);
  expect(sent('override-remove')).toEqual([
    {type: 'override-remove', id: 2, name: 'cfg', keys: ['mode']},
  ]);
});

test('the bar reports dropped overrides until dismissed', async () => {
  const {el, root} = await mountOverridden();
  push('inspector-message', {
    type: 'overrides',
    applied: true,
    entries: [],
    dropped: [
      {
        id: 2,
        tagName: 'x-button',
        name: 'cfg',
        keys: ['theme', 'mode'],
        value: '"dark"',
        enabled: false,
      },
    ],
  });
  await flush(el);
  const notice = () => root.querySelector<HTMLElement>('.overrides-dropped');
  expect(notice()!.querySelector('code')!.textContent).toBe(
    '<x-button>.cfg.theme.mode'
  );
  expect(root.querySelector('.overrides-bar wa-switch')).toBeNull();
  notice()!.querySelector<HTMLElement>('.remove-override')!.click();
  await flush(el);
  expect(root.querySelector('.overrides-bar')).toBeNull();
});

test('the pin keeps an override across reloads, where the page can', async () => {
  const {el, row, root, sent} = await mountOverridden();
  expect(row().querySelector('.pin-override')).toBeNull();
  push('inspector-message', {
    type: 'overrides',
    applied: true,
    canPersist: true,
    waiting: 2,
    entries: [
      {
        id: 2,
        tagName: 'x-button',
        name: 'label',
        value: '"Send"',
        enabled: true,
      },
    ],
  });
  await flush(el);
  const pin = row().querySelector<HTMLElement>('.pin-override')!;
  expect(pin.getAttribute('aria-pressed')).toBe('false');
  pin.click();
  root.querySelector<HTMLElement>('.overrides-list .pin-override')!.click();
  await flush(el);
  expect(sent('override-persist')).toEqual([
    {type: 'override-persist', id: 2, name: 'label', persist: true},
    {type: 'override-persist', id: 2, name: 'label', persist: true},
  ]);
  expect(root.querySelector('.overrides-bar .waiting')!.textContent).toBe(
    ', 2 saved, not on this page'
  );
});

test('a saved override that no longer applies is reported', async () => {
  const {el, root} = await mountOverridden();
  push('inspector-message', {
    type: 'overrides',
    applied: true,
    entries: [],
    dropped: [
      {
        id: 2,
        tagName: 'x-button',
        name: 'size',
        value: '3',
        enabled: false,
        reason: 'refused',
      },
    ],
  });
  await flush(el);
  const text = root
    .querySelector('.overrides-dropped')!
    .textContent!.replace(/\s+/g, ' ')
    .trim();
  expect(text).toBe('A saved override no longer applies: <x-button>.size.');
});

test('details-only shows just the details, for the element the host inspector selects', async () => {
  const {el, root, inspects} = await mount(true);
  el.detailsOnly = true;
  await flush(el);
  try {
    expect(root.querySelector('.toolbar')).toBeNull();
    expect(root.querySelector('.tree')).toBeNull();
    const placeholder = () =>
      root.querySelector('.details .placeholder')?.textContent;
    expect(placeholder()).toBe(
      'Select an element inside a Lit component to inspect it.'
    );

    followElement(2);
    await flush(el);
    expect(inspects()).toContainEqual({type: 'watch', id: 2});
    push('inspector-message', {type: 'details', details: detailsFor()});
    await flush(el);
    expect(root.querySelector('.details h2')).not.toBeNull();
    expect(root.querySelector('[aria-label="Reveal in Elements"]')).toBeNull();

    followElement(null);
    await flush(el);
    expect(inspects().at(-1)).toEqual({type: 'watch', id: null});
    expect(placeholder()).toBe(
      'Select an element inside a Lit component to inspect it.'
    );
  } finally {
    resetFollowedElement();
  }
});
