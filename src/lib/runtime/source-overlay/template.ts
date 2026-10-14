import {FONT_MONO_VAR} from '../fonts.js';
import {CODE_ICON, CUBE_ICON} from '../../icons.js';

// Shadow DOM for the overlay: a transparent modal <dialog> hosting the
// dimming mask, the highlight ring, and the bottom-fixed tooltip panel. The
// panel is a two-section split: declaration icon (the Components tab's
// cube) | tag + path + arrow-key steps. A second row of the same shape, with
// a code icon, shows where the element is written in a template (its call
// site), when known.
const OVERLAY_CSS = `
    dialog {
      background: transparent;
      border: none;
      padding: 0;
      margin: 0;
      max-width: none;
      max-height: none;
      pointer-events: none;
    }
    #mask {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background: rgba(0,0,0,0);
      transition: background-color 0.3s cubic-bezier(0.9, 0, 0.1, 1);
    }
    #highlight {
      position: fixed;
      top: 0;
      left: 0;
      display: none;
      pointer-events: none;
      box-sizing: border-box;
      border-radius: 0;
      /* Same box the inspector panel draws on tree hover (inspector/install.ts),
         so picking and panel-hovering read as the same selection. */
      background: rgba(77, 99, 255, 0.25);
      outline: 1px solid #4d63ff;
      transition: all 80ms ease-out;
    }
    #tooltip {
      position: fixed;
      /* Lift above the Vite DevTools edge panel when it's docked to the bottom
         (--edge-bottom is set from JS; 0 otherwise). */
      bottom: calc(16px + var(--edge-bottom, 0px));
      left: 50%;
      translate: -50%;
      display: none;
      flex-direction: column;
      /* Decorative: the pointer goes through to the page, so the element under
         the tooltip can still be hovered and picked. */
      pointer-events: none;
      max-width: min(90vw, 480px);
      border-radius: var(--lit-devtools-radius-md);
      background: var(--lit-devtools-surface-elevated);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: var(--lit-devtools-text-strong);
      font: 12px/1.4 ${FONT_MONO_VAR};
      box-shadow: var(--lit-devtools-shadow-md);
      overflow: hidden;
    }
    .row {
      display: flex;
      align-items: stretch;
    }
    #site-row { border-top: 1px solid var(--lit-devtools-border-subtle); }
    /* The row a click would open with the modifiers held right now. */
    .row {
      transition: background-color var(--lit-devtools-dur-fast)
        var(--lit-devtools-ease-standard);
    }
    .row.armed { background: var(--lit-devtools-accent-soft); }
    .row.armed .icon { color: var(--lit-devtools-accent); }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      padding: 0 12px;
    }
    .icon svg {
      width: 16px;
      height: 16px;
      display: block;
      fill: currentColor;
    }
    #meta, #site-meta {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      justify-content: center;
      gap: 1px;
      min-width: 0;
      padding: 6px 10px;
      border-left: 1px solid var(--lit-devtools-border-subtle);
      border-right: 1px solid var(--lit-devtools-border-subtle);
    }
    #tag {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--lit-devtools-text-strong);
    }
    #path, #site-path {
      color: var(--lit-devtools-text-secondary);
      font-size: 11px;
      word-break: break-all;
    }
    .label { color: var(--lit-devtools-text-muted); }
    /* Where the arrow keys step: out to the enclosing host, back in. */
    #step {
      color: var(--lit-devtools-text-secondary);
      font-size: 11px;
      white-space: pre;
    }
  `;

/** An element with attributes and children, built without parsing markup. */
const el = (
  tag: string,
  attrs: Record<string, string>,
  ...children: Node[]
): HTMLElement => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs))
    node.setAttribute(name, value);
  node.append(...children);
  return node;
};

/** One of the `icons.ts` SVGs, rebuilt from its viewBox and path. */
const icon = (svg: string): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(ns, 'svg');
  root.setAttribute(
    'viewBox',
    /viewBox="([^"]*)"/.exec(svg)?.[1] ?? '0 0 256 256'
  );
  root.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', /\sd="([^"]*)"/.exec(svg)?.[1] ?? '');
  root.append(path);
  return root;
};

/**
 * Fill `root` with the overlay. Built with DOM calls rather than `innerHTML`,
 * which a page enforcing Trusted Types refuses: the runtime has no policy of
 * its own there, and must not take the name of the page's.
 */
export const renderOverlay = (root: ShadowRoot): void => {
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  root.append(
    style,
    el(
      'dialog',
      {id: 'overlay'},
      el('div', {id: 'mask'}),
      el('div', {id: 'highlight'}),
      el(
        'div',
        {id: 'tooltip'},
        el(
          'div',
          {id: 'source-row', class: 'row'},
          el(
            'span',
            {id: 'open', class: 'icon', 'aria-hidden': 'true'},
            icon(CUBE_ICON)
          ),
          el(
            'div',
            {id: 'meta'},
            el('span', {id: 'tag'}),
            el('span', {id: 'path'}),
            el('span', {id: 'step'})
          )
        ),
        el(
          'div',
          {id: 'site-row', class: 'row'},
          el(
            'span',
            {id: 'site-open', class: 'icon', 'aria-hidden': 'true'},
            icon(CODE_ICON)
          ),
          el(
            'div',
            {id: 'site-meta'},
            el(
              'span',
              {id: 'site-path'},
              el(
                'span',
                {class: 'label'},
                document.createTextNode('rendered at ')
              ),
              el('span', {id: 'site-text'})
            )
          )
        )
      )
    )
  );
};
