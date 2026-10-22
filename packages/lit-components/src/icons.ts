/**
 * Phosphor Icons (https://phosphoricons.com), Copyright (c) 2023 Phosphor
 * Icons, MIT License (full text in THIRD_PARTY_NOTICES.md), for `lit-icon`
 * and every Web Awesome element that draws a glyph.
 *
 * Web Awesome's `default` library fetches Font Awesome SVGs from a CDN at
 * runtime. This module replaces it with inlined Phosphor SVGs, so nothing
 * leaves the bundle and only the icons a consumer lists ship: a starter set
 * below, and {@link registerIcons} for the rest. An unknown name renders
 * nothing. Names are Phosphor's, regular weight.
 *
 * The same pattern as the DevTools panel's src/panel/wa-icons.ts, which
 * moves here when the panel adopts lit-*.
 */
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import {
  getIconLibrary,
  registerIconLibrary,
} from '@awesome.me/webawesome/dist/components/icon/library.js';
import arrowRight from '@phosphor-icons/core/assets/regular/arrow-right.svg?raw';
import arrowSquareOut from '@phosphor-icons/core/assets/regular/arrow-square-out.svg?raw';
import caretDown from '@phosphor-icons/core/assets/regular/caret-down.svg?raw';
import caretLeft from '@phosphor-icons/core/assets/regular/caret-left.svg?raw';
import caretRight from '@phosphor-icons/core/assets/regular/caret-right.svg?raw';
import caretUp from '@phosphor-icons/core/assets/regular/caret-up.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import copy from '@phosphor-icons/core/assets/regular/copy.svg?raw';
import cube from '@phosphor-icons/core/assets/regular/cube.svg?raw';
import gear from '@phosphor-icons/core/assets/regular/gear.svg?raw';
import info from '@phosphor-icons/core/assets/regular/info.svg?raw';
import lightning from '@phosphor-icons/core/assets/regular/lightning.svg?raw';
import magnifyingGlass from '@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw';
import play from '@phosphor-icons/core/assets/regular/play.svg?raw';
import plus from '@phosphor-icons/core/assets/regular/plus.svg?raw';
import trash from '@phosphor-icons/core/assets/regular/trash.svg?raw';
import warning from '@phosphor-icons/core/assets/regular/warning.svg?raw';
import packageIcon from '@phosphor-icons/core/assets/regular/package.svg?raw';
import x from '@phosphor-icons/core/assets/regular/x.svg?raw';

const icons = new Map<string, string>(
  Object.entries({
    'arrow-right': arrowRight,
    'arrow-square-out': arrowSquareOut,
    'caret-down': caretDown,
    'caret-left': caretLeft,
    'caret-right': caretRight,
    'caret-up': caretUp,
    check,
    copy,
    cube,
    gear,
    info,
    lightning,
    'magnifying-glass': magnifyingGlass,
    play,
    plus,
    trash,
    warning,
    package: packageIcon,
    x,
  })
);

const toUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/**
 * Adds icons by name, as SVG markup (import them with `?raw`). Icons already
 * on the page re-render only when their `name` changes, so register before
 * first render.
 */
export const registerIcons = (more: Record<string, string>) => {
  for (const [name, svg] of Object.entries(more)) icons.set(name, svg);
};

/** Names that currently resolve. */
export const iconNames = () => [...icons.keys()];

registerIconLibrary('default', {
  resolver: (name) => {
    const svg = icons.get(name);
    return svg === undefined ? '' : toUri(svg);
  },
});

/**
 * Web Awesome components draw their own glyphs (a select's arrow, a checked
 * state, tab-scroll chevrons) from the inlined `system` library. Swap in the
 * Phosphor equivalents, and defer to the original for anything else.
 */
const SYSTEM: Record<string, string> = {
  check,
  'chevron-down': caretDown,
  'chevron-left': caretLeft,
  'chevron-right': caretRight,
  'chevron-up': caretUp,
  xmark: x,
};
const system = getIconLibrary('system');
if (system !== undefined) {
  registerIconLibrary('system', {
    resolver: (name, family, variant, autoWidth) =>
      SYSTEM[name] !== undefined
        ? toUri(SYSTEM[name])
        : system.resolver(name, family, variant, autoWidth),
    mutator: system.mutator,
  });
}
