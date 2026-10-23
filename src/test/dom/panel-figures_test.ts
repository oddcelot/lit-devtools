import {afterEach, beforeAll, expect, test, vi} from 'vite-plus/test';
import type {TimelineFigure} from '../../panel/figures/timeline-figure.js';
import type {UpdatesFigure} from '../../panel/figures/updates-figure.js';

// The figures settle that there is no host; the fake client stands in for
// the connection their views would otherwise look for.
vi.mock('../../panel/figures/no-host.js', () => ({}));
vi.mock('../../panel/client.js', () => import('./fakes/client.js'));

// happy-dom has no layout, so the real virtualizer never renders a row. This
// stand-in lists every item, which is all these tests read.
vi.mock('@lit-labs/virtualizer/virtualize.js', () => ({
  virtualizerRef: Symbol('virtualizerRef'),
  virtualize: ({
    items,
    renderItem,
  }: {
    items: unknown[];
    renderItem: (item: unknown) => unknown;
  }) => items.map((item) => renderItem(item)),
}));

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!('assignedSlot' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'assignedSlot', {
      configurable: true,
      get: () => null,
    });
  }
  await import('../../panel/figures/timeline-figure.js');
  await import('../../panel/figures/updates-figure.js');
});

afterEach(() => {
  document.body.replaceChildren();
});

/** Mounts `html` and waits for the figure and the view inside it. */
const mount = async <
  T extends HTMLElement & {updateComplete: Promise<unknown>},
>(
  html: string
): Promise<T> => {
  document.body.innerHTML = html;
  const figure = document.body.firstElementChild as T;
  await figure.updateComplete;
  const view = figure.shadowRoot!.firstElementChild as HTMLElement & {
    updateComplete: Promise<unknown>;
  };
  await view.updateComplete;
  return figure;
};

const list = (figure: TimelineFigure) =>
  figure.shadowRoot!.querySelector('timeline-event-list')!;

// From the recording the figures share (timeline-recording.json): the
// counter's first `update`, and the Router's first navigation.
const COUNTER_UPDATE = 'mvk1zotj-30';
const NAVIGATE = 'mvk1zotj-16';

test('event selects the span holding that recorded event', async () => {
  const figure = await mount<TimelineFigure>(
    `<timeline-figure mode="list" event="${COUNTER_UPDATE}"></timeline-figure>`
  );
  const selected = list(figure).shadowRoot!.querySelector('.row.selected');
  expect(selected?.textContent).toContain('update');
  expect(selected?.textContent).toContain('hmr-counter');
});

test('raw opens the list with Raw on, and event selects the raw row', async () => {
  const figure = await mount<TimelineFigure>(
    `<timeline-figure mode="list" raw event="${NAVIGATE}"></timeline-figure>`
  );
  expect(list(figure).raw).toBe(true);
  const selected = list(figure).shadowRoot!.querySelector('.row.selected');
  expect(selected?.textContent).toContain('navigate /inbox');
});

test('range draws that range on the tracks', async () => {
  const figure = await mount<TimelineFigure>(
    `<timeline-figure range="580.8-582.4"></timeline-figure>`
  );
  const tracks = figure.shadowRoot!.querySelector('timeline-tracks')!;
  expect(tracks.range).toEqual({start: 580.8, end: 582.4});
});

test('component opens the Updates view on that tag', async () => {
  const figure = await mount<UpdatesFigure>(
    `<updates-figure component="hmr-counter"></updates-figure>`
  );
  const view = figure.shadowRoot!.querySelector('updates-view')!;
  await view.updateComplete;
  const selected = view.shadowRoot!.querySelector('.row.selected');
  expect(selected?.textContent).toContain('hmr-counter');
});
