/**
 * The Components details snapshot describes an element's slots and parts,
 * and the anatomy overlay draws them on the page. Worth an e2e because slot
 * assignment, forwarding and layout only behave for real in a real browser.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {
  INSPECT_CMD_CHANNEL,
  INSPECT_DATA_CHANNEL,
  type InspectorDetails,
  type InspectorMessage,
  type InspectorTreeNode,
} from '../../types/inspector.js';
import {type Fixture, startFixture} from './utils.js';

let fixture: Fixture;
let roots: InspectorTreeNode[] = [];
const details: InspectorDetails[] = [];

beforeAll(async () => {
  fixture = await startFixture({plugin: {timeline: true}});
  fixture.server.hot.on(INSPECT_DATA_CHANNEL, (data: InspectorMessage) => {
    if (data.type === 'tree') roots = data.roots;
    if (data.type === 'details') details.push(data.details);
  });
});

afterAll(async () => {
  await fixture?.close();
});

const find = (
  nodes: InspectorTreeNode[],
  tag: string
): InspectorTreeNode | undefined => {
  for (const node of nodes) {
    if (node.tagName === tag) return node;
    const found = find(node.children, tag);
    if (found !== undefined) return found;
  }
  return undefined;
};

const nodeFor = async (tag: string): Promise<InspectorTreeNode> => {
  await expect
    .poll(
      () => {
        fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'tree'});
        return find(roots, tag);
      },
      {timeout: 10_000}
    )
    .toBeDefined();
  return find(roots, tag)!;
};

const detailsFor = async (id: number): Promise<InspectorDetails> => {
  await expect
    .poll(
      () => {
        fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'details', id});
        return details.find((d) => d.id === id);
      },
      {timeout: 10_000}
    )
    .toBeDefined();
  return details.find((d) => d.id === id)!;
};

test('describes slots, orphans and parts of a real component', async () => {
  const {id} = await nodeFor('hmr-slots');
  const {anatomy} = await detailsFor(id);
  expect(anatomy).toMatchObject({
    renderRoot: 'shadow',
    mode: 'open',
    delegatesFocus: false,
    slots: [
      {name: 'icon', status: 'empty'},
      {name: 'title', status: 'assigned', elements: [{tagName: 'strong'}]},
      {name: '', status: 'assigned', elements: [{tagName: 'p'}]},
      {name: 'footer', status: 'fallback'},
    ],
    orphans: [{tagName: 'em', slot: 'aside'}],
    parts: [
      {names: ['header'], tagName: 'header'},
      {names: ['body'], tagName: 'div'},
    ],
  });
});

test('marks content forwarded through an enclosing slot', async () => {
  const frame = await nodeFor('hmr-slots-frame');
  const card = find(frame.children, 'hmr-slots')!;
  const {anatomy} = await detailsFor(card.id);
  expect(anatomy?.slots[2]).toMatchObject({
    name: '',
    status: 'assigned',
    forwarded: true,
    elements: [{tagName: 'p'}],
  });
});

test('lists parts forwarded by a nested component with exportparts', async () => {
  const frame = await nodeFor('hmr-slots-frame');
  const {anatomy} = await detailsFor(frame.id);
  expect(anatomy?.parts).toEqual([
    {names: ['header'], tagName: 'header', forwarded: {from: 'hmr-slots'}},
    {
      names: ['card-body'],
      tagName: 'div',
      forwarded: {from: 'hmr-slots', inner: 'body'},
    },
  ]);
});

test('refreshes a watched element when a light child changes slot', async () => {
  const {id} = await nodeFor('hmr-slots');
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'watch', id});
  const latest = () =>
    details.filter((d) => d.id === id).at(-1)?.anatomy?.slots;
  await expect.poll(latest, {timeout: 10_000}).toBeDefined();

  // No re-render happens: only the child's `slot` attribute changes.
  await fixture.page.evaluate(
    `document.querySelector('hmr-slots > p').setAttribute('slot', 'icon')`
  );
  await expect
    .poll(() => latest()?.[0].status, {timeout: 10_000})
    .toBe('assigned');

  await fixture.page.evaluate(
    `document.querySelector('hmr-slots > p').removeAttribute('slot')`
  );
  await expect
    .poll(() => latest()?.[0].status, {timeout: 10_000})
    .toBe('empty');
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'watch', id: null});
});

/**
 * What the overlay has drawn, read in the page: the labels, the boxes and the
 * leaders still shown, in drawing order (host first, then slots, then parts).
 * With every label text unique, the Nth label, box and leader go together.
 */
const SNAPSHOT = `(() => {
  const layer = document.querySelector('[data-lit-devtools-anatomy]');
  const shown = (sel) =>
    Array.from(layer.querySelectorAll(sel)).filter(
      (el) => el.style.display !== 'none'
    );
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
  };
  const labels = shown('[data-anatomy-label]');
  const boxes = shown('[data-anatomy-box]');
  const leaders = shown('svg g');
  return {
    texts: labels.map((l) => l.textContent),
    labels: labels.map(rect),
    boxes: boxes.map(rect),
    boxStyles: boxes.map((b) => [b.style.opacity, b.style.boxShadow !== 'none']),
    labelOpacity: labels.map((l) => l.style.opacity),
    leaders: leaders.map((g) => ({
      end: {
        x: Number(g.lastElementChild.getAttribute('cx')),
        y: Number(g.lastElementChild.getAttribute('cy')),
      },
      opacity: g.style.opacity,
      width: g.firstElementChild.getAttribute('stroke-width'),
    })),
  };
})()`;

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Snapshot {
  texts: string[];
  labels: Rect[];
  boxes: Rect[];
  boxStyles: [string, boolean][];
  labelOpacity: string[];
  leaders: {end: {x: number; y: number}; opacity: string; width: string}[];
}

const snapshot = (): Promise<Snapshot> => fixture.page.evaluate(SNAPSHOT);

const overlap = (a: Rect, b: Rect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** How far `p` is from the outline of `r`. */
const edgeDistance = (r: Rect, p: {x: number; y: number}): number => {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right);
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return Math.min(p.x - r.left, r.right - p.x, p.y - r.top, r.bottom - p.y);
};

/** Screenshots the host with room for the label gutters either side. */
const shoot = async (path: string): Promise<void> => {
  const box = (await fixture.page.locator('hmr-slots').first().boundingBox())!;
  await fixture.page.screenshot({
    path,
    clip: {
      x: Math.max(0, box.x - 260),
      y: Math.max(0, box.y - 88),
      width: box.width + 520,
      height: box.height + 112,
    },
  });
};

test('draws labelled slot and part regions until cleared', async () => {
  const {id} = await nodeFor('hmr-slots');
  await fixture.page.evaluate(
    `document.querySelector('hmr-slots').scrollIntoView({block: 'center'})`
  );
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'anatomy', id});

  await expect
    .poll(async () => (await snapshot()).texts, {timeout: 10_000})
    .toEqual([
      '<hmr-slots>',
      'slot "title"',
      'default slot',
      'slot "footer" · fallback',
      '::part(header)',
      '::part(body)',
    ]);
  const drawn = await snapshot();
  // No two labels overlap, and every label but the host's stands clear of the host.
  const [host, ...regions] = drawn.boxes;
  drawn.labels.forEach((a, i) => {
    drawn.labels.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false));
    if (i > 0) expect(overlap(a, host)).toBe(false);
  });
  // Each region has a leader that ends on its box's edge.
  expect(drawn.leaders).toHaveLength(regions.length);
  drawn.leaders.forEach(({end}, i) => {
    expect(edgeDistance(regions[i], end)).toBeLessThanOrEqual(3);
  });
  if (process.env['ANATOMY_SHOT']) {
    await shoot(process.env['ANATOMY_SHOT']);
  }

  // Focus the title slot: it gains a ring and a thicker leader, everything
  // else fades.
  const focused = async () => {
    const s = await snapshot();
    return s.texts.map((text, i) => [
      text,
      s.boxStyles[i][0],
      s.boxStyles[i][1],
      s.labelOpacity[i],
      i === 0 ? null : s.leaders[i - 1].opacity,
      i === 0 ? null : s.leaders[i - 1].width,
    ]);
  };
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'anatomy-focus',
    focus: {kind: 'slot', index: 1},
  });
  await expect.poll(focused, {timeout: 10_000}).toEqual([
    ['<hmr-slots>', '0.25', false, '0.25', null, null],
    ['slot "title"', '1', true, '1', '1', '2'],
    ['default slot', '0.25', false, '0.25', '0.25', '1.25'],
    ['slot "footer" · fallback', '0.25', false, '0.25', '0.25', '1.25'],
    ['::part(header)', '0.25', false, '0.25', '0.25', '1.25'],
    ['::part(body)', '0.25', false, '0.25', '0.25', '1.25'],
  ]);
  if (process.env['ANATOMY_SHOT']) {
    await shoot(process.env['ANATOMY_SHOT'].replace('.png', '-focus.png'));
  }
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'anatomy-focus',
    focus: null,
  });
  await expect
    .poll(
      async () => {
        const s = await snapshot();
        return (
          s.boxStyles.every(([o, ring]) => o === '1' && !ring) &&
          s.leaders.every((l) => l.opacity === '1')
        );
      },
      {timeout: 10_000}
    )
    .toBe(true);

  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'anatomy', id: null});
  await expect
    .poll(
      () =>
        fixture.page.evaluate(
          `document.querySelector('[data-lit-devtools-anatomy]') === null`
        ),
      {timeout: 10_000}
    )
    .toBe(true);
});

test('draws just one region while the overlay is off', async () => {
  const {id} = await nodeFor('hmr-slots');
  const only = async () => {
    const s = await snapshot();
    return {texts: s.texts, boxes: s.boxes.length, leaders: s.leaders.length};
  };
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'anatomy',
    id,
    only: {kind: 'part', index: 0},
  });
  await expect
    .poll(only, {timeout: 10_000})
    .toEqual({texts: ['::part(header)'], boxes: 1, leaders: 1});
  const {leaders, boxes, boxStyles} = await snapshot();
  expect(edgeDistance(boxes[0], leaders[0].end)).toBeLessThanOrEqual(3);
  expect(boxStyles[0]).toEqual(['1', true]);

  // Slot 0 (`icon`) is empty, so there is nothing to draw.
  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {
    type: 'anatomy',
    id,
    only: {kind: 'slot', index: 0},
  });
  await expect
    .poll(only, {timeout: 10_000})
    .toEqual({texts: [], boxes: 0, leaders: 0});

  fixture.server.hot.send(INSPECT_CMD_CHANNEL, {type: 'anatomy', id: null});
});
