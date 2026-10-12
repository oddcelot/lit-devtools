import {describe, expect, test} from 'vite-plus/test';
import {
  type Box,
  type Group,
  type Region,
  GUTTER,
  anchorOf,
  assignSides,
  edgePoint,
  groupLabel,
  groupRegions,
  layoutLabels,
  LABEL_RISE,
  leaderTo,
  pack,
  sideFor,
} from '../../lib/runtime/inspector/anatomy-layout.js';

const box = (left: number, top: number, w: number, h: number): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

const region = (text: string, b: Box, key = text): Region => ({
  key,
  text,
  color: '#000',
  box: b,
});

const group = (text: string, ...boxes: Box[]): Group => ({
  text,
  color: '#000',
  regions: boxes.map((b, i) => region(text, b, `${text}:${i}`)),
});

const view = {width: 1000, height: 600};
const host = box(400, 200, 200, 200);

describe('pack', () => {
  const item = (want: number, size = 16) => ({want, size});

  test('leaves items that already fit where they want to be', () => {
    expect(pack([item(10), item(100)], 3, 0, 500)).toEqual([10, 100]);
  });

  test('never overlaps and keeps the order of the wishes', () => {
    const items = [50, 52, 51, 50, 300].map((w) => item(w));
    const at = pack(items, 3, 0, 600);
    const order = items
      .map((_, i) => i)
      .sort((a, b) => items[a].want - items[b].want || a - b);
    order.slice(1).forEach((idx, k) => {
      expect(at[idx] - at[order[k]]).toBeGreaterThanOrEqual(16 + 3);
    });
    expect(at[4]).toBe(300);
  });

  test('centres a spread cluster on what its members wanted', () => {
    const at = pack([item(100), item(100)], 4, 0, 500);
    expect(at).toEqual([90, 110]);
  });

  test('pulls a stack back inside the upper bound', () => {
    const at = pack([item(90), item(92)], 2, 0, 100);
    expect(at[1] + 16).toBeLessThanOrEqual(100);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(18);
  });

  test('keeps the lower bound when the room is too small', () => {
    const at = pack([item(0), item(0), item(0)], 2, 5, 30);
    expect(at[0]).toBe(5);
  });
});

describe('grouping', () => {
  test('merges identical texts, counting them and averaging their anchors', () => {
    const groups = groupRegions([
      region('a', box(0, 0, 10, 10), 'a0'),
      region('b', box(0, 0, 10, 10), 'b0'),
      region('a', box(0, 100, 10, 10), 'a1'),
    ]);
    expect(groups.map(groupLabel)).toEqual(['a ×2', 'b']);
    expect(anchorOf(groups[0])).toEqual({x: 5, y: 55});
  });
});

describe('sides', () => {
  test('a label goes to the side its region leans to', () => {
    expect(sideFor(group('l', box(410, 250, 20, 20)), host)).toBe('left');
    expect(sideFor(group('r', box(570, 250, 20, 20)), host)).toBe('right');
  });

  test('both gutters are used when they fit', () => {
    const groups = [
      group('l', box(410, 250, 20, 20)),
      group('r', box(570, 250, 20, 20)),
    ];
    expect(assignSides(groups, [80, 80], host, view)).toEqual([
      'left',
      'right',
    ]);
  });

  test('a gutter off the viewport gives way to the other side', () => {
    const edge = box(2, 200, 200, 200);
    const groups = [group('l', box(10, 250, 20, 20))];
    expect(assignSides(groups, [80], edge, view)).toEqual(['right']);
    const far = box(800, 200, 196, 200);
    const right = [group('r', box(950, 250, 20, 20))];
    expect(assignSides(right, [80], far, view)).toEqual(['left']);
  });

  test('falls back to a row when neither gutter fits', () => {
    const wide = box(10, 200, 980, 200);
    const groups = [group('l', box(20, 250, 20, 20))];
    expect(assignSides(groups, [80], wide, view)).toEqual(['row']);
  });
});

describe('layoutLabels', () => {
  test('stacks crowded labels in the gutter without overlap, outside the host', () => {
    const groups = Array.from({length: 6}, (_, i) =>
      group(`p${i}`, box(410, 290 + i, 20, 4))
    );
    const places = layoutLabels(
      groups,
      groups.map(() => 90),
      16,
      host,
      view
    );
    const sorted = [...places].sort((a, b) => a.top - b.top);
    sorted.slice(1).forEach((p, i) => {
      expect(p.top).toBeGreaterThanOrEqual(sorted[i].top + sorted[i].height);
    });
    for (const p of places) {
      expect(p.side).toBe('left');
      expect(p.left + p.width).toBe(host.left - GUTTER);
    }
  });

  test('puts the row above the host, or below it with no room above', () => {
    const wide = box(10, 200, 980, 100);
    const g = [group('x', box(20, 220, 20, 20))];
    expect(layoutLabels(g, [60], 16, wide, view)[0]).toMatchObject({
      side: 'above',
      top: 200 - GUTTER - 16,
    });
    const low = box(10, 10, 980, 100);
    expect(layoutLabels(g, [60], 16, low, view)[0]).toMatchObject({
      side: 'below',
      top: 110 + GUTTER,
    });
  });

  test('packs a row horizontally without overlap', () => {
    const wide = box(10, 200, 980, 100);
    const groups = ['a', 'b', 'c'].map((t) => group(t, box(500, 220, 10, 10)));
    const places = layoutLabels(groups, [100, 100, 100], 16, wide, view);
    expect(places[1].left).toBeGreaterThanOrEqual(places[0].left + 100);
    expect(places[2].left).toBeGreaterThanOrEqual(places[1].left + 100);
  });
});

describe('leaders', () => {
  const on = (b: Box, p: {x: number; y: number}) =>
    ((p.x === b.left || p.x === b.right) && p.y >= b.top && p.y <= b.bottom) ||
    ((p.y === b.top || p.y === b.bottom) && p.x >= b.left && p.x <= b.right);

  test('end on the facing edge at the height of the label', () => {
    const b = box(450, 250, 40, 40);
    expect(edgePoint(b, {x: 300, y: 270})).toEqual({x: 450, y: 270});
  });

  test('end on the corner when the label is past the box vertically', () => {
    const b = box(450, 250, 40, 40);
    expect(edgePoint(b, {x: 300, y: 100})).toEqual({x: 450, y: 250});
  });

  test('a point inside goes to the nearest edge', () => {
    const b = box(450, 250, 40, 40);
    expect(edgePoint(b, {x: 455, y: 270})).toEqual({x: 450, y: 270});
  });

  test('every leader ends on its region edge, starting at the label', () => {
    const b = box(450, 250, 40, 40);
    const [left] = layoutLabels([group('l', b)], [90], 16, host, view);
    const leader = leaderTo(left, b);
    expect(on(b, leader.end)).toBe(true);
    expect(leader.d.startsWith(`M${left.left + left.width},`)).toBe(true);
  });

  const pointsOf = (d: string) =>
    Array.from(d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g), ([, x, y]) => ({
      x: Number(x),
      y: Number(y),
    }));

  test('a leader bends once at 45° and meets its region level', () => {
    const b = box(450, 250, 40, 40);
    const [left] = layoutLabels([group('l', b)], [90], 16, host, view);
    // Pull the label well above the region so there is a bend to make.
    const placed = {...left, top: left.top - 60};
    const [start, stub, elbow, end] = pointsOf(leaderTo(placed, b).d);
    expect(stub.y).toBe(start.y);
    expect(Math.abs(elbow.x - stub.x)).toBeCloseTo(Math.abs(elbow.y - stub.y));
    expect(end.y).toBe(elbow.y);
    expect(end.x).toBeGreaterThan(elbow.x);
  });

  test('a column label sits LABEL_RISE above where its leader lands', () => {
    const b = box(450, 250, 40, 100);
    const [left] = layoutLabels([group('l', b)], [90], 16, host, view);
    expect(left.top + 8).toBe(anchorOf(group('l', b)).y - LABEL_RISE);
    const [start, , , end] = pointsOf(leaderTo(left, b).d);
    expect(end.y - start.y).toBe(LABEL_RISE);
  });

  test('a region closer than the bend needs gets a steeper straight run', () => {
    const b = box(450, 250, 40, 40);
    const [left] = layoutLabels([group('l', b)], [90], 16, host, view);
    const placed = {...left, top: left.top - 400};
    const [, , elbow, end] = pointsOf(leaderTo(placed, b).d);
    expect(elbow).toEqual(end);
  });
});
