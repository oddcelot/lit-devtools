/**
 * Pure geometry for the anatomy overlay's callouts: which labels go where,
 * and the leader line from each to its region. It knows nothing of the DOM,
 * only rectangles, so the overlay measures, calls in here, and draws.
 *
 * Labels sit in two gutters, left and right of the host, each region's label
 * on the side its centre leans to. A gutter that would leave the viewport
 * gives way to the other; when neither fits, the labels line up in a row
 * above the host (below it when there is no room above). Within a column or
 * row the labels are packed so none overlap, as close to their regions as
 * that allows. Regions that share a label text share one label.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Side = 'left' | 'right' | 'above' | 'below';

/** One drawn region and the label text it answers to. */
export interface Region {
  key: string;
  text: string;
  color: string;
  box: Box;
}

/** Regions with the same label text, which get one label between them. */
export interface Group {
  text: string;
  color: string;
  regions: Region[];
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
  side: Side;
}

/** Space kept between a label and the host, and between stacked labels. */
export const GUTTER = 24;
const LABEL_GAP = 3;
/** Space kept between a label and the viewport's edge. */
const MARGIN = 4;
/** How far a leader runs straight out of its label before it bends. */
const STUB = 8;
/**
 * How far a column label sits above the height its leader lands at, so
 * every leader bends rather than running flat.
 */
export const LABEL_RISE = 12;

const centreOf = (b: Box): Point => ({
  x: (b.left + b.right) / 2,
  y: (b.top + b.bottom) / 2,
});

/** Groups regions by label text, in order of first appearance. */
export const groupRegions = (regions: Region[]): Group[] => {
  const byText = new Map<string, Group>();
  for (const r of regions) {
    const group = byText.get(r.text);
    if (group === undefined) {
      byText.set(r.text, {text: r.text, color: r.color, regions: [r]});
    } else {
      group.regions.push(r);
    }
  }
  return [...byText.values()];
};

/** What a group's label says: its text, and how many regions it covers. */
export const groupLabel = (g: Group): string =>
  g.regions.length > 1 ? `${g.text} ×${g.regions.length}` : g.text;

/** The mean of a group's region centres, where its label would like to be. */
export const anchorOf = (g: Group): Point => {
  const centres = g.regions.map((r) => centreOf(r.box));
  const sum = (pick: (p: Point) => number) =>
    centres.reduce((n, p) => n + pick(p), 0) / centres.length;
  return {x: sum((p) => p.x), y: sum((p) => p.y)};
};

/** The gutter a group's label goes to: the side its centre leans to. */
export const sideFor = (g: Group, host: Box): 'left' | 'right' =>
  anchorOf(g).x < centreOf(host).x ? 'left' : 'right';

interface Item {
  /** Where the item would start along the axis if nothing were in its way. */
  want: number;
  size: number;
}

interface Run {
  start: number;
  end: number;
  /** Mean of `want - offset` over the run, which is where its start goes. */
  sum: number;
  size: number;
}

/**
 * Merges runs of items that would overlap into one block each, placed at the
 * mean of its members' wishes. `items` are sorted by `want`.
 */
const runsOf = (items: Item[], gap: number): Run[] => {
  const runs: Run[] = [];
  items.forEach((item, i) => {
    let run: Run = {start: i, end: i, sum: item.want, size: item.size};
    for (let prev = runs.at(-1); prev !== undefined; prev = runs.at(-1)) {
      const count = prev.end - prev.start + 1;
      if (prev.sum / count + prev.size + gap <= run.sum / (i - run.start + 1)) {
        break;
      }
      const shift = prev.size + gap;
      const joined = i - run.start + 1;
      run = {
        start: prev.start,
        end: i,
        sum: prev.sum + run.sum - joined * shift,
        size: prev.size + gap + run.size,
      };
      runs.pop();
    }
    runs.push(run);
  });
  return runs;
};

/** Where each sorted item starts, before the bounds are applied. */
const startsOf = (items: Item[], gap: number): number[] => {
  const starts: number[] = [];
  for (const run of runsOf(items, gap)) {
    let at = run.sum / (run.end - run.start + 1);
    for (let i = run.start; i <= run.end; i++) {
      starts[i] = at;
      at += items[i].size + gap;
    }
  }
  return starts;
};

/** Pushes each start past `min` and the item before it. */
const sweepDown = (
  starts: number[],
  items: Item[],
  gap: number,
  min: number
): void => {
  starts.forEach((s, i) => {
    const floor = i === 0 ? min : starts[i - 1] + items[i - 1].size + gap;
    starts[i] = Math.max(s, floor);
  });
};

/** Pulls each start back from `max` and the item after it. */
const sweepUp = (
  starts: number[],
  items: Item[],
  gap: number,
  max: number
): void => {
  for (let i = starts.length - 1; i >= 0; i--) {
    const end = i === starts.length - 1 ? max : starts[i + 1] - gap;
    starts[i] = Math.min(starts[i], end - items[i].size);
  }
};

/**
 * Where each item starts along an axis so none overlap, with `gap` between
 * neighbours, in the input's order. Items keep the order of their `want`;
 * each cluster that has to spread out is centred on what its members
 * wanted. The result is pulled inside `[min, max]` when the items fit.
 */
export const pack = (
  items: Item[],
  gap: number,
  min: number,
  max: number
): number[] => {
  const order = items
    .map((_, i) => i)
    .sort((a, b) => items[a].want - items[b].want || a - b);
  const sorted = order.map((i) => items[i]);
  const starts = startsOf(sorted, gap);
  // Down from the lower bound, up from the upper, then down again, so a
  // stack too long for the room ends at the lower bound, not off the far side.
  sweepDown(starts, sorted, gap, min);
  sweepUp(starts, sorted, gap, max);
  sweepDown(starts, sorted, gap, min);
  const out: number[] = [];
  order.forEach((at, i) => (out[at] = starts[i]));
  return out;
};

/** Whether a gutter on `side` has room for labels up to `width` wide. */
const gutterFits = (
  side: 'left' | 'right',
  width: number,
  host: Box,
  view: Viewport
): boolean =>
  side === 'left'
    ? host.left - GUTTER - width >= MARGIN
    : host.right + GUTTER + width <= view.width - MARGIN;

/** The side each group's label goes to, or a row when no gutter fits. */
export const assignSides = (
  groups: Group[],
  widths: number[],
  host: Box,
  view: Viewport
): ('left' | 'right' | 'row')[] => {
  const sides = groups.map((g) => sideFor(g, host));
  const widest = (side: string) =>
    Math.max(0, ...widths.filter((_, i) => sides[i] === side));
  const own = (['left', 'right'] as const).every(
    (s) => !sides.includes(s) || gutterFits(s, widest(s), host, view)
  );
  if (own) return sides;
  const all = Math.max(0, ...widths);
  for (const side of ['right', 'left'] as const) {
    if (gutterFits(side, all, host, view)) return sides.map(() => side);
  }
  return sides.map(() => 'row');
};

/** Packs the labels of one gutter into a column, nearest their regions. */
const columnPlacements = (
  side: 'left' | 'right',
  idx: number[],
  groups: Group[],
  widths: number[],
  height: number,
  host: Box,
  view: Viewport
): Map<number, Placement> => {
  const starts = pack(
    idx.map((i) => ({
      want: anchorOf(groups[i]).y - LABEL_RISE - height / 2,
      size: height,
    })),
    LABEL_GAP,
    MARGIN,
    view.height - MARGIN
  );
  const out = new Map<number, Placement>();
  idx.forEach((i, k) => {
    const left =
      side === 'left' ? host.left - GUTTER - widths[i] : host.right + GUTTER;
    out.set(i, {left, top: starts[k], width: widths[i], height, side});
  });
  return out;
};

/** Packs the labels into one row above the host, or below it with no room. */
const rowPlacements = (
  idx: number[],
  groups: Group[],
  widths: number[],
  height: number,
  host: Box,
  view: Viewport
): Map<number, Placement> => {
  const above = host.top - GUTTER - height >= MARGIN;
  const top = above ? host.top - GUTTER - height : host.bottom + GUTTER;
  const starts = pack(
    idx.map((i) => ({
      want: anchorOf(groups[i]).x - widths[i] / 2,
      size: widths[i],
    })),
    LABEL_GAP,
    MARGIN,
    view.width - MARGIN
  );
  const out = new Map<number, Placement>();
  idx.forEach((i, k) => {
    const side = above ? 'above' : 'below';
    out.set(i, {left: starts[k], top, width: widths[i], height, side});
  });
  return out;
};

/** Where each group's label goes, in the order of `groups`. */
export const layoutLabels = (
  groups: Group[],
  widths: number[],
  height: number,
  host: Box,
  view: Viewport
): Placement[] => {
  const sides = assignSides(groups, widths, host, view);
  const placed = new Map<number, Placement>();
  for (const side of ['left', 'right', 'row'] as const) {
    const idx = groups.map((_, i) => i).filter((i) => sides[i] === side);
    if (idx.length === 0) continue;
    const found =
      side === 'row'
        ? rowPlacements(idx, groups, widths, height, host, view)
        : columnPlacements(side, idx, groups, widths, height, host, view);
    found.forEach((p, i) => placed.set(i, p));
  }
  return groups.map((_, i) => placed.get(i)!);
};

/** Where a label's leader leaves it: the middle of the edge facing the host. */
const leaderStart = (p: Placement): Point => {
  const mid = {x: p.left + p.width / 2, y: p.top + p.height / 2};
  switch (p.side) {
    case 'left':
      return {x: p.left + p.width, y: mid.y};
    case 'right':
      return {x: p.left, y: mid.y};
    case 'above':
      return {x: mid.x, y: p.top + p.height};
    case 'below':
      return {x: mid.x, y: p.top};
  }
};

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi);

/**
 * The point of `box` nearest `from`, on its edge: the facing edge at the
 * height of the label, or its corner when the label sits past the box's
 * vertical range. A point inside the box goes to the nearest edge.
 */
export const edgePoint = (box: Box, from: Point): Point => {
  const x = clamp(from.x, box.left, box.right);
  const y = clamp(from.y, box.top, box.bottom);
  if (x !== from.x || y !== from.y) return {x, y};
  const gaps = [
    {d: from.x - box.left, p: {x: box.left, y}},
    {d: box.right - from.x, p: {x: box.right, y}},
    {d: from.y - box.top, p: {x, y: box.top}},
    {d: box.bottom - from.y, p: {x, y: box.bottom}},
  ];
  return gaps.reduce((a, b) => (b.d < a.d ? b : a)).p;
};

export interface Leader {
  /**
   * SVG path data: a stub out of the label, then a 45° bend into the
   * region, or a curve for one of a grouped label's several leaders.
   */
  d: string;
  end: Point;
}

const STUB_DIRECTION: Record<Side, Point> = {
  left: {x: 1, y: 0},
  right: {x: -1, y: 0},
  above: {x: 0, y: 1},
  below: {x: 0, y: -1},
};

/**
 * Where a leader leaving `stub` along `dir` bends: a 45° run that covers
 * the offset across `dir`, so the last stretch meets `end` straight on. A
 * region too close along `dir` for that gets no bend, and the diagonal
 * steepens to reach it.
 */
const elbowOf = (stub: Point, end: Point, dir: Point): Point => {
  const across = dir.x !== 0 ? end.y - stub.y : end.x - stub.x;
  const along = (end.x - stub.x) * dir.x + (end.y - stub.y) * dir.y;
  const run = Math.abs(across);
  if (run >= along) return end;
  return dir.x !== 0
    ? {x: stub.x + dir.x * run, y: end.y}
    : {x: end.x, y: stub.y + dir.y * run};
};

/**
 * A curve from `stub` to `end` that leaves along `dir` and arrives the same
 * way, for the leaders of a grouped label: a fan of curves reads as one
 * bundle where angled runs would criss-cross.
 */
const curveTo = (stub: Point, end: Point, dir: Point): string => {
  const mid = dir.x !== 0 ? (stub.x + end.x) / 2 : (stub.y + end.y) / 2;
  const c1 = dir.x !== 0 ? `${mid},${stub.y}` : `${stub.x},${mid}`;
  const c2 = dir.x !== 0 ? `${mid},${end.y}` : `${end.x},${mid}`;
  return `C${c1} ${c2} ${end.x},${end.y}`;
};

/**
 * The leader from a label to the region `box`: angled, or curved when
 * `fan` says the label leads to several regions.
 */
export const leaderTo = (p: Placement, box: Box, fan = false): Leader => {
  const start = leaderStart(p);
  const dir = STUB_DIRECTION[p.side];
  // A column label sits LABEL_RISE above where its leader should land.
  const rise = dir.x !== 0 ? LABEL_RISE : 0;
  const end = edgePoint(box, {x: start.x, y: start.y + rise});
  const stub = {x: start.x + dir.x * STUB, y: start.y + dir.y * STUB};
  const elbow = elbowOf(stub, end, dir);
  const rest = fan
    ? curveTo(stub, end, dir)
    : `L${elbow.x},${elbow.y} L${end.x},${end.y}`;
  return {d: `M${start.x},${start.y} L${stub.x},${stub.y} ${rest}`, end};
};
