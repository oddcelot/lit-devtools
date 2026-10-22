/**
 * The HMR indicator's shadow markup, apart from its behaviour
 * (`indicator.ts`), so the kitchen sink can draw the same indicator in
 * place. `#container` takes the states as classes: `with-count` shows the
 * running count, `active` plays the pulse, `style-swap` colours it for a
 * stylesheet-only update.
 *
 * `--idle-op` is the at-rest opacity: 0 (invisible until a pulse) without a
 * count, .5 (count stays legible) with one. The count display and idle
 * opacity are both driven by the `.with-count` class so the panel can
 * toggle the count on/off live.
 */
import {FONT_MONO_VAR} from './fonts.js';
import {FLAME_ICON} from '../icons.js';

export const INDICATOR_HTML = `
      <style>
        @keyframes pulse{0%{opacity:var(--idle-op,0)}15%{opacity:1}80%{opacity:1}100%{opacity:var(--idle-op,0)}}
        :host{
          position:fixed;inset:0;display:grid;
          z-index:2147483647;pointer-events:none;
          /* Base padding plus the inset the Vite DevTools edge panel occupies
             on each edge (set from JS), so the indicator never sits on it. */
          padding:
            calc(var(--lit-devtools-hmr-indicator-padding,16px) + var(--edge-top,0px))
            calc(var(--lit-devtools-hmr-indicator-padding,16px) + var(--edge-right,0px))
            calc(var(--lit-devtools-hmr-indicator-padding,16px) + var(--edge-bottom,0px))
            calc(var(--lit-devtools-hmr-indicator-padding,16px) + var(--edge-left,0px))
        }
        #container{
          place-self:var(--lit-devtools-hmr-indicator-align,end end);
          display:flex;align-items:stretch;
          background:var(--lit-devtools-surface-elevated);color:var(--lit-devtools-text-strong);
          backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
          border-radius:var(--lit-devtools-radius-md);
          font:12px/1 ${FONT_MONO_VAR};font-variant-numeric:tabular-nums;
          overflow:hidden;opacity:var(--idle-op,0)
        }
        #container.with-count{--idle-op:.5}
        #container.active{animation:pulse 2.5s ease-out forwards}
        #icon{display:flex;align-items:center;justify-content:center;padding:0 10px}
        #icon svg{width:16px;height:16px;display:block;fill:currentColor}
        #indicator{
          display:flex;align-items:center;gap:6px;
          padding:7px 12px;
          border-left:1px solid var(--lit-devtools-border-subtle)
        }
        .dot{width:8px;height:8px;border-radius:0;background:var(--lit-devtools-success);flex-shrink:0}
        /* Style-only swaps (shared adopted stylesheet hot-swap, no re-render)
           pulse in the calmer info color and don't bump the count. */
        #container.style-swap .dot{background:var(--lit-devtools-info)}
        .count{display:none}
        #container.with-count .count{display:inline}
      </style>
      <div id="container"><span id="icon">${FLAME_ICON}</span><span id="indicator"><span class="dot"></span><span class="count">0</span></span></div>
`;
