import {afterEach, expect, test} from 'vite-plus/test';
import '../../panel/timeline-layers.js';
import type {LayerState} from '../../panel/timeline-layers.js';

const layers: LayerState[] = [
  {id: 'lit-lifecycle', label: 'Lifecycle', color: 0xff0000, enabled: true},
  {id: 'mouse', label: 'Mouse', color: 0x00ff00, enabled: false},
];

const mount = async (props: {layers: LayerState[]}) => {
  const el = document.createElement('timeline-layers');
  Object.assign(el, props);
  document.body.append(el);
  await el.updateComplete;
  return {el, buttons: [...el.shadowRoot!.querySelectorAll('button')]};
};

afterEach(() => {
  document.body.replaceChildren();
});

test('one pill per layer, marked on when enabled', async () => {
  const {buttons} = await mount({layers});
  expect(buttons.map((b) => b.textContent!.trim())).toEqual([
    'Lifecycle',
    'Mouse',
  ]);
  expect(buttons.map((b) => b.classList.contains('on'))).toEqual([true, false]);
  expect(buttons[0]!.dataset.tip).toBe('Hide Lifecycle');
  expect(buttons[1]!.dataset.tip).toBe('Show Mouse');
});

test('a click asks the view to toggle that layer', async () => {
  const {buttons} = await mount({layers});
  const toggled: string[] = [];
  // Composed and bubbling, so the view hears it from outside the shadow root.
  document.body.addEventListener('layer-toggle', (e) =>
    toggled.push((e as CustomEvent<{id: string}>).detail.id)
  );
  buttons[1]!.click();
  expect(toggled).toEqual(['mouse']);
});

test('each chip exposes its state as aria-pressed', async () => {
  const {buttons} = await mount({layers});
  expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
    'true',
    'false',
  ]);
});

test('as a menu, a row per layer with a track toggle for the trackable', async () => {
  const el = document.createElement('timeline-layers');
  Object.assign(el, {
    layers: [
      ...layers,
      {id: 'lit-render', label: 'Render', color: 0x0000ff, enabled: true},
    ],
    menu: true,
    tracks: {
      trackable: new Set(['lit-lifecycle', 'lit-render']),
      hidden: new Set(['lit-render']),
    },
  });
  document.body.append(el);
  await el.updateComplete;
  const root = el.shadowRoot!;
  const tracks = [...root.querySelectorAll<HTMLButtonElement>('.track')];
  expect(
    tracks.map((t) => [t.getAttribute('aria-pressed'), t.disabled])
  ).toEqual([
    ['true', false],
    // Mouse is off: nothing recorded, so no track to show.
    ['false', true],
    ['false', false],
  ]);
  const toggled: string[] = [];
  el.addEventListener('track-toggle', (e) =>
    toggled.push((e as CustomEvent<{id: string}>).detail.id)
  );
  tracks[2]!.click();
  expect(toggled).toEqual(['lit-render']);
  // In the List view there are no tracks to toggle.
  Object.assign(el, {tracks: null});
  await el.updateComplete;
  expect(root.querySelectorAll('.track')).toHaveLength(0);
});
