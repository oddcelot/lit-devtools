/**
 * Overrides the page let go of on its own, kept until the panel is told:
 * a leaf override whose object the app replaced, or a saved override that no
 * longer fits the element it was restored to. Each is reported once.
 */

import type {ValueSegment} from '../../../types/inspector.js';

export interface OverrideDrop {
  el: Element;
  name: string;
  keys?: ValueSegment[];
  value: unknown;
  reason: 'replaced' | 'refused';
}

let drops: OverrideDrop[] = [];

export const noteDrop = (drop: OverrideDrop): void => {
  drops.push(drop);
};

/** How many drops wait to be reported. */
export const pendingDrops = (): number => drops.length;

/** The drops since the last call, oldest first. */
export const takeDrops = (): OverrideDrop[] => {
  const out = drops;
  drops = [];
  return out;
};
