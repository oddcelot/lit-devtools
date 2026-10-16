import {describe, expect, test} from 'vite-plus/test';
import {
  ComponentsSession,
  LIVE_LS_KEY,
  findAncestors,
} from '../../panel/components-session.js';
import type {
  InspectorCommand,
  InspectorDetails,
  InspectorTreeNode,
} from '../../types/inspector.js';
import {
  MAX_HMR_INCOMPATIBILITIES,
  type HmrIncompatibilityEvent,
} from '../../types/hmr-incompatibility.js';
import type {HmrPatchEvent} from '../../types/hmr-patch.js';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

/**
 * A session wired to recording ports. `sent` is every command the page was
 * sent, `events` the outward notices in order.
 */
const setup = (stored: Record<string, string> = {}) => {
  const sent: InspectorCommand[] = [];
  const events: string[] = [];
  const storage = memoryStorage(stored);
  const session = new ComponentsSession({
    send: (command) => sent.push(command),
    storage,
    onSelect: (id) => events.push(`select ${id}`),
    onPicked: () => events.push('picked'),
  });
  let changes = 0;
  session.subscribe(() => changes++);
  /** Commands sent since the last call. */
  const drain = () => sent.splice(0);
  return {session, storage, events, drain, changes: () => changes};
};

// <x-app id=1> > <x-list id=2> > <x-item id=3>
const tree: InspectorTreeNode[] = [
  {
    id: 1,
    tagName: 'x-app',
    children: [
      {
        id: 2,
        tagName: 'x-list',
        children: [{id: 3, tagName: 'x-item', children: []}],
      },
    ],
  },
];
const detailsFor = (id: number): InspectorDetails => ({
  id,
  tagName: 'x-item',
  attributes: [],
  properties: [],
  flags: {hasUpdated: true, isUpdatePending: false, hasShadowRoot: true},
});
const incompatible = (time: number): HmrIncompatibilityEvent => ({
  tagName: 'x-a',
  time,
  reason: {code: 'accessor-decorators'},
  action: 'reload',
});
const patch = (at: number): HmrPatchEvent => ({
  tagName: 'x-a',
  instances: 1,
  generation: 1,
  durationMs: 1,
  childState: 'transfer',
  at,
});

describe('connecting', () => {
  test('primes from the node side, then asks for a fresh tree and arms Live', () => {
    const {session, drain} = setup();
    session.connected({
      roots: tree,
      hmrIncompatibilities: [incompatible(1)],
      hmrHistory: [
        {kind: 'patched', at: 1, patch: patch(1)},
        {kind: 'incompatible', at: 2, incompatibility: incompatible(2)},
      ],
    });
    expect(session.roots).toBe(tree);
    expect(session.hmrIncompatibilities).toHaveLength(1);
    // The newest patch, skipping the failure after it.
    expect(session.lastPatch).toEqual(patch(1));
    expect(drain()).toEqual([
      {type: 'tree'},
      {type: 'overrides'},
      {type: 'observe', enabled: true},
    ]);
  });

  test('leaves Live off when it was paused last time', () => {
    const {session, drain} = setup({[LIVE_LS_KEY]: 'false'});
    expect(session.live).toBe(false);
    session.connected({roots: [], hmrIncompatibilities: []});
    expect(drain()).toEqual([{type: 'tree'}, {type: 'overrides'}]);
  });
});

describe('selecting', () => {
  test('reveals the element, then asks for the tree, its details and a watch', () => {
    const {session, events, drain} = setup();
    session.connected({roots: tree, hmrIncompatibilities: []});
    drain();
    session.select(3);
    expect(events).toEqual(['select 3']);
    expect([...session.expanded]).toEqual([1, 2]);
    expect(drain()).toEqual([
      {type: 'tree'},
      {type: 'details', id: 3},
      {type: 'watch', id: 3},
    ]);
  });

  test('releases the previous watch first, and ignores reselecting', () => {
    const {session, events, drain} = setup();
    session.select(2);
    drain();
    session.select(3);
    expect(drain()[0]).toEqual({type: 'watch', id: null});
    session.select(3);
    expect(drain()).toEqual([]);
    expect(events).toEqual(['select 2', 'select 3']);
  });

  test('reveals a node the old tree did not have once the new tree arrives', () => {
    const {session} = setup();
    session.select(3);
    expect(session.expanded.size).toBe(0);
    session.receive({type: 'tree', roots: tree});
    expect([...session.expanded]).toEqual([1, 2]);
  });

  test('takes details and gone only for the selected element', () => {
    const {session} = setup();
    session.select(3);
    session.receive({type: 'details', details: detailsFor(9)});
    expect(session.details).toBeNull();
    session.receive({type: 'details', details: detailsFor(3)});
    expect(session.details).toEqual(detailsFor(3));
    session.receive({type: 'gone', id: 9});
    expect(session.gone).toBe(false);
    session.receive({type: 'gone', id: 3});
    expect(session).toMatchObject({details: null, gone: true});
  });

  test('a pick from the page selects it and brings the tab forward', () => {
    const {session, events, drain} = setup();
    session.togglePick();
    expect(session.picking).toBe(true);
    expect(drain()).toEqual([{type: 'pick'}]);
    session.receive({type: 'pick', id: 3});
    expect(session.picking).toBe(false);
    expect(session.selectedId).toBe(3);
    expect(events).toEqual(['select 3', 'picked']);
  });
});

describe('re-arming', () => {
  test('a ready re-sends the tree, the details, the watch and Live', () => {
    const {session, drain} = setup();
    session.select(3);
    drain();
    session.receive({type: 'ready', litPackages: {lit: ['3.0.0']}});
    expect(session.runtime).toEqual({
      ready: true,
      litPackages: {lit: ['3.0.0']},
      topFrame: true,
      chromeTracks: true,
    });
    expect(drain()).toEqual([
      {type: 'tree'},
      {type: 'overrides'},
      {type: 'details', id: 3},
      {type: 'watch', id: 3},
      {type: 'observe', enabled: true},
    ]);
  });

  test('rewatch takes the watch back for the selection, and nothing without one', () => {
    const {session, drain} = setup();
    session.rewatch();
    expect(drain()).toEqual([]);
    session.select(3);
    drain();
    session.rewatch();
    expect(drain()).toEqual([
      {type: 'details', id: 3},
      {type: 'watch', id: 3},
    ]);
  });

  test('deselect drops the selection and its watch', () => {
    const {session, drain} = setup();
    session.select(3);
    session.receive({type: 'details', details: {id: 3} as InspectorDetails});
    drain();
    session.deselect();
    expect(drain()).toEqual([{type: 'watch', id: null}]);
    expect(session.selectedId).toBeNull();
    expect(session.details).toBeNull();
    session.deselect();
    expect(drain()).toEqual([]);
  });

  test('a ready with nothing selected and Live paused only asks for the tree and overrides', () => {
    const {session, drain} = setup({[LIVE_LS_KEY]: 'false'});
    session.receive({type: 'ready'});
    expect(drain()).toEqual([{type: 'tree'}, {type: 'overrides'}]);
  });

  test('a page change forgets the old page but keeps and re-watches the selection', () => {
    const {session, drain} = setup();
    session.connected({roots: tree, hmrIncompatibilities: [incompatible(1)]});
    session.hmrPatched(patch(1));
    session.select(3);
    session.receive({type: 'details', details: detailsFor(3)});
    drain();

    session.pageChanged();
    expect(session).toMatchObject({
      roots: [],
      hmrIncompatibilities: [],
      lastPatch: null,
      selectedId: 3,
      details: null,
      gone: false,
    });
    expect(drain()).toEqual([
      {type: 'tree'},
      {type: 'overrides'},
      {type: 'details', id: 3},
      {type: 'watch', id: 3},
    ]);
  });
});

describe('overrides', () => {
  test('keeps the list the page sends, and forgets it on a page change', () => {
    const {session} = setup();
    const entries = [
      {id: 3, tagName: 'x-b', name: 'n', value: '1', enabled: true},
    ];
    session.receive({type: 'overrides', applied: false, entries});
    expect(session.overrides).toEqual({applied: false, entries});
    session.receive({
      type: 'overrides',
      applied: true,
      entries,
      canPersist: true,
      waiting: 2,
    });
    expect(session.overrides).toEqual({
      applied: true,
      entries,
      canPersist: true,
      waiting: 2,
    });
    session.pageChanged();
    expect(session.overrides).toEqual({applied: true, entries: []});
  });

  test('acts on the selection, or on the element an entry names', () => {
    const {session, drain} = setup();
    session.toggleOverride('n', false);
    expect(drain()).toEqual([]);
    session.connected({roots: tree, hmrIncompatibilities: []});
    session.select(3);
    drain();
    session.toggleOverride('n', false);
    session.removeOverride('n');
    session.removeOverride('m', [], 1);
    session.toggleOverride('cfg', true, ['a', 0]);
    session.removeOverride('cfg', ['a', 0]);
    session.persistOverride('n', true);
    session.persistOverride('cfg', false, ['a'], 1);
    expect(drain()).toEqual([
      {type: 'override-toggle', id: 3, name: 'n', enabled: false},
      {type: 'override-remove', id: 3, name: 'n'},
      {type: 'override-remove', id: 1, name: 'm'},
      {
        type: 'override-toggle',
        id: 3,
        name: 'cfg',
        keys: ['a', 0],
        enabled: true,
      },
      {type: 'override-remove', id: 3, name: 'cfg', keys: ['a', 0]},
      {type: 'override-persist', id: 3, name: 'n', persist: true},
      {
        type: 'override-persist',
        id: 1,
        name: 'cfg',
        keys: ['a'],
        persist: false,
      },
    ]);
  });

  test('collects dropped overrides until dismissed or the page changes', () => {
    const {session} = setup();
    const drop = {
      id: 3,
      tagName: 'x-b',
      name: 'cfg',
      keys: ['a'],
      value: '1',
      enabled: false,
    };
    session.receive({
      type: 'overrides',
      applied: true,
      entries: [],
      dropped: [drop],
    });
    session.receive({type: 'overrides', applied: true, entries: []});
    expect(session.droppedOverrides).toEqual([drop]);
    session.dismissDropped();
    expect(session.droppedOverrides).toEqual([]);
    session.receive({
      type: 'overrides',
      applied: true,
      entries: [],
      dropped: [drop],
    });
    session.pageChanged();
    expect(session.droppedOverrides).toEqual([]);
  });

  test('the global switch and clear-all re-ask for the selection', () => {
    const {session, drain} = setup();
    session.connected({roots: tree, hmrIncompatibilities: []});
    session.select(3);
    drain();
    session.applyOverrides(false);
    session.clearOverrides();
    expect(drain()).toEqual([
      {type: 'overrides-apply', applied: false},
      {type: 'details', id: 3},
      {type: 'overrides-clear'},
      {type: 'details', id: 3},
    ]);
  });
});

describe('finding the selection on a new page', () => {
  const key = {tag: 'x-item', site: '/src/list.ts:9:5', nth: 2};
  const selectWithKey = () => {
    const ctx = setup();
    ctx.session.connected({roots: tree, hmrIncompatibilities: []});
    ctx.session.select(3);
    ctx.session.receive({type: 'details', details: {...detailsFor(3), key}});
    ctx.drain();
    ctx.events.length = 0;
    return ctx;
  };

  test('a page change looks the selection up by its key', () => {
    const {session, events, drain} = selectWithKey();
    session.pageChanged();
    expect(drain()).toEqual([
      {type: 'tree'},
      {type: 'overrides'},
      {type: 'locate', key},
    ]);
    session.receive({type: 'located', key, id: 8});
    expect(session.selectedId).toBe(8);
    expect(events).toEqual(['select 8']);
    expect(drain()).toEqual([
      {type: 'details', id: 8},
      {type: 'watch', id: 8},
    ]);
  });

  test('a key the new page cannot find keeps the id', () => {
    const {session, events, drain} = selectWithKey();
    session.pageChanged();
    drain();
    session.receive({type: 'located', key, id: null});
    expect(session.selectedId).toBe(3);
    expect(events).toEqual([]);
    expect(drain()).toEqual([
      {type: 'details', id: 3},
      {type: 'watch', id: 3},
    ]);
  });

  test('an answer nobody asked for, or for an old selection, is ignored', () => {
    const {session, drain} = selectWithKey();
    session.receive({type: 'located', key, id: 8});
    session.pageChanged();
    session.select(2);
    drain();
    session.receive({type: 'located', key, id: 8});
    expect(session.selectedId).toBe(2);
    expect(drain()).toEqual([]);
  });
});

describe('Live', () => {
  test('pausing is remembered and pulls one fresh tree; resuming re-arms', () => {
    const {session, storage, drain} = setup();
    session.toggleLive();
    expect(session.live).toBe(false);
    expect(storage.data.get(LIVE_LS_KEY)).toBe('false');
    expect(drain()).toEqual([
      {type: 'observe', enabled: false},
      {type: 'tree'},
    ]);
    session.toggleLive();
    expect(storage.data.get(LIVE_LS_KEY)).toBe('true');
    expect(drain()).toEqual([{type: 'observe', enabled: true}]);
  });

  test('leaving releases the watch and the observer', () => {
    const {session, drain} = setup();
    session.dispose();
    expect(drain()).toEqual([
      {type: 'watch', id: null},
      {type: 'observe', enabled: false},
    ]);
  });
});

test('HMR notices are capped like the node side', () => {
  const {session} = setup();
  for (let i = 0; i < MAX_HMR_INCOMPATIBILITIES + 5; i++) {
    session.hmrIncompatible(incompatible(i));
  }
  expect(session.hmrIncompatibilities).toHaveLength(MAX_HMR_INCOMPATIBILITIES);
  expect(session.hmrIncompatibilities.at(-1)?.time).toBe(
    MAX_HMR_INCOMPATIBILITIES + 4
  );
});

test('tells subscribers about every change, and not about ignored messages', () => {
  const {session, changes} = setup();
  session.select(3);
  session.toggleExpand(1);
  const before = changes();
  session.receive({type: 'details', details: detailsFor(9)});
  expect(changes()).toBe(before);
  session.receive({type: 'details', details: detailsFor(3)});
  expect(changes()).toBe(before + 1);
});

test('findAncestors lists the path to an element, or null when absent', () => {
  expect(findAncestors(tree, 3)).toEqual([1, 2]);
  expect(findAncestors(tree, 1)).toEqual([]);
  expect(findAncestors(tree, 42)).toBeNull();
});
