/**
 * Phosphor icons (https://phosphoricons.com, MIT) for the docs, in the
 * regular weight, as SVG strings that take `currentColor`.
 *
 * Only the icons imported below ship. That keeps the build from globbing
 * Phosphor's 9,000 files, and an unknown name fails the type check instead of
 * rendering nothing. Add a name here before using it on a page. The panel
 * keeps its own list in src/panel/wa-icons.ts.
 */
import arrowRight from '@phosphor-icons/core/assets/regular/arrow-right.svg?raw';
import chartBarHorizontal from '@phosphor-icons/core/assets/regular/chart-bar-horizontal.svg?raw';
import bookOpen from '@phosphor-icons/core/assets/regular/book-open.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import copy from '@phosphor-icons/core/assets/regular/copy.svg?raw';
import cursorClick from '@phosphor-icons/core/assets/regular/cursor-click.svg?raw';
import githubLogo from '@phosphor-icons/core/assets/regular/github-logo.svg?raw';
import hardDrives from '@phosphor-icons/core/assets/regular/hard-drives.svg?raw';
import lightning from '@phosphor-icons/core/assets/regular/lightning.svg?raw';
import monitor from '@phosphor-icons/core/assets/regular/monitor.svg?raw';
import moon from '@phosphor-icons/core/assets/regular/moon.svg?raw';
import packageIcon from '@phosphor-icons/core/assets/regular/package.svg?raw';
import paintBrush from '@phosphor-icons/core/assets/regular/paint-brush.svg?raw';
import plugsConnected from '@phosphor-icons/core/assets/regular/plugs-connected.svg?raw';
import robot from '@phosphor-icons/core/assets/regular/robot.svg?raw';
import shieldCheck from '@phosphor-icons/core/assets/regular/shield-check.svg?raw';
import sun from '@phosphor-icons/core/assets/regular/sun.svg?raw';
import treeStructure from '@phosphor-icons/core/assets/regular/tree-structure.svg?raw';

const icons = {
  'arrow-right': arrowRight,
  'book-open': bookOpen,
  'chart-bar-horizontal': chartBarHorizontal,
  check,
  copy,
  'cursor-click': cursorClick,
  'github-logo': githubLogo,
  'hard-drives': hardDrives,
  lightning,
  monitor,
  moon,
  package: packageIcon,
  'paint-brush': paintBrush,
  'plugs-connected': plugsConnected,
  robot,
  'shield-check': shieldCheck,
  sun,
  'tree-structure': treeStructure,
};

export type IconName = keyof typeof icons;

/** The icon's SVG markup, `size` square (any CSS length), hidden from assistive tech. */
export function phosphor(name: IconName, size = '1em'): string {
  return icons[name].replace(
    '<svg ',
    `<svg width="${size}" height="${size}" aria-hidden="true" focusable="false" `
  );
}
