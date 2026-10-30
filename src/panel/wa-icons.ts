/**
 * Phosphor Icons (https://phosphoricons.com), Copyright (c) 2023 Phosphor
 * Icons, MIT License (full text in THIRD_PARTY_NOTICES.md): the panel's set.
 *
 * packages/lit-components' icons.ts swaps Web Awesome's CDN icon library for
 * inlined SVGs (and defines `<wa-icon>`); this module adds the names the
 * panel draws, so only these ship and an unlisted name renders nothing.
 * Names are Phosphor's, in the regular weight unless they end in `-fill`.
 *
 * Views import this module rather than an icon element directly, so no icon
 * renders before its SVG is registered.
 */
import {registerIcons} from '../../packages/lit-components/src/icons.js';
import arrowsClockwise from '@phosphor-icons/core/assets/regular/arrows-clockwise.svg?raw';
import arrowsInLineVertical from '@phosphor-icons/core/assets/regular/arrows-in-line-vertical.svg?raw';
import arrowsOutLineVertical from '@phosphor-icons/core/assets/regular/arrows-out-line-vertical.svg?raw';
import arrowCounterClockwise from '@phosphor-icons/core/assets/regular/arrow-counter-clockwise.svg?raw';
import arrowUUpLeft from '@phosphor-icons/core/assets/regular/arrow-u-up-left.svg?raw';
import arrowRight from '@phosphor-icons/core/assets/regular/arrow-right.svg?raw';
import arrowSquareOut from '@phosphor-icons/core/assets/regular/arrow-square-out.svg?raw';
import boundingBox from '@phosphor-icons/core/assets/regular/bounding-box.svg?raw';
import caretDown from '@phosphor-icons/core/assets/regular/caret-down.svg?raw';
import caretRight from '@phosphor-icons/core/assets/regular/caret-right.svg?raw';
import caretUp from '@phosphor-icons/core/assets/regular/caret-up.svg?raw';
import check from '@phosphor-icons/core/assets/regular/check.svg?raw';
import clock from '@phosphor-icons/core/assets/regular/clock.svg?raw';
import dropSimple from '@phosphor-icons/core/assets/regular/drop-simple.svg?raw';
import dropSimpleFill from '@phosphor-icons/core/assets/fill/drop-simple-fill.svg?raw';
import crosshair from '@phosphor-icons/core/assets/regular/crosshair.svg?raw';
import copy from '@phosphor-icons/core/assets/regular/copy.svg?raw';
import cube from '@phosphor-icons/core/assets/regular/cube.svg?raw';
import cursorClick from '@phosphor-icons/core/assets/regular/cursor-click.svg?raw';
import equals from '@phosphor-icons/core/assets/regular/equals.svg?raw';
import exportIcon from '@phosphor-icons/core/assets/regular/export.svg?raw';
import fileCode from '@phosphor-icons/core/assets/regular/file-code.svg?raw';
import gear from '@phosphor-icons/core/assets/regular/gear.svg?raw';
import info from '@phosphor-icons/core/assets/regular/info.svg?raw';
import lightning from '@phosphor-icons/core/assets/regular/lightning.svg?raw';
import magnifyingGlass from '@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw';
import pencilSimple from '@phosphor-icons/core/assets/regular/pencil-simple.svg?raw';
import pauseCircle from '@phosphor-icons/core/assets/regular/pause-circle.svg?raw';
import packageIcon from '@phosphor-icons/core/assets/regular/package.svg?raw';
import notification from '@phosphor-icons/core/assets/regular/notification.svg?raw';
import pushPin from '@phosphor-icons/core/assets/regular/push-pin.svg?raw';
import record from '@phosphor-icons/core/assets/regular/record.svg?raw';
import stack from '@phosphor-icons/core/assets/regular/stack.svg?raw';
import stop from '@phosphor-icons/core/assets/regular/stop.svg?raw';
import target from '@phosphor-icons/core/assets/regular/target.svg?raw';
import terminal from '@phosphor-icons/core/assets/regular/terminal.svg?raw';
import toggleLeft from '@phosphor-icons/core/assets/regular/toggle-left.svg?raw';
import toggleRight from '@phosphor-icons/core/assets/regular/toggle-right.svg?raw';
import trash from '@phosphor-icons/core/assets/regular/trash.svg?raw';
import warning from '@phosphor-icons/core/assets/regular/warning.svg?raw';
import x from '@phosphor-icons/core/assets/regular/x.svg?raw';

const ICONS = {
  'arrow-counter-clockwise': arrowCounterClockwise,
  'arrow-right': arrowRight,
  'arrow-u-up-left': arrowUUpLeft,
  'arrows-clockwise': arrowsClockwise,
  'arrows-in-line-vertical': arrowsInLineVertical,
  'arrows-out-line-vertical': arrowsOutLineVertical,
  'arrow-square-out': arrowSquareOut,
  'bounding-box': boundingBox,
  'caret-down': caretDown,
  'caret-right': caretRight,
  'caret-up': caretUp,
  check,
  clock,
  copy,
  crosshair,
  cube,
  'cursor-click': cursorClick,
  'drop-simple': dropSimple,
  'drop-simple-fill': dropSimpleFill,
  equals,
  export: exportIcon,
  'file-code': fileCode,
  gear,
  info,
  lightning,
  'magnifying-glass': magnifyingGlass,
  notification,
  package: packageIcon,
  'pause-circle': pauseCircle,
  'pencil-simple': pencilSimple,
  'push-pin': pushPin,
  record,
  stack,
  stop,
  target,
  terminal,
  'toggle-left': toggleLeft,
  'toggle-right': toggleRight,
  trash,
  warning,
  x,
} as const;

/** A name `<wa-icon name=…>` resolves in the panel. */
export type IconName = keyof typeof ICONS;

registerIcons(ICONS);
