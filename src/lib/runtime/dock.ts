/**
 * The panel docked in the page itself, for standalone hosts that serve the
 * panel from the page's own server (`createLitDevtools()`).
 *
 * A button in the corner opens a drawer along the bottom of the page with the
 * panel in an iframe. Framed by the page, the panel also reaches it over the
 * direct in-page channel (see `panel/in-page.ts`), so hovering the tree
 * highlights without a round trip to the server.
 *
 * Plain DOM in an open shadow root rather than a Lit element: the runtime
 * counts the page's Lit elements, and the dock is not one of the page's.
 * The iframe is only created on first open, so a dock nobody opens costs
 * the page nothing but the button.
 */

export interface Dock {
  /** Open the drawer, on `href` when given (a hash change keeps the panel). */
  show(href?: string): void;
  hide(): void;
  toggle(): void;
}

const STORAGE_KEY = 'lit-devtools:dock';
const MIN_HEIGHT = 160;

interface DockState {
  open: boolean;
  height: number;
}

const FLAME = `<svg viewBox="0 0 160 200" aria-hidden="true"><path fill="#00e8ff" d="M40 120l20-60l90 90l-30 50l-40-40h-20"/><path fill="#283198" d="M80 160v-80l40-40v80M0 160l40 40l20-40l-20-40h-20"/><path fill="#324fff" d="M40 120v-80l40-40v80M120 200v-80l40-40v80M0 160v-80l40 40"/><path fill="#00ffff" d="M40 200v-80l40 40"/></svg>`;

const STYLES = `
  :host {
    all: initial;
    --height: 40vh;
  }
  .toggle {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483001;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1px solid #d0d4e4;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.15);
    cursor: pointer;
  }
  .toggle svg {
    width: 18px;
    height: 22px;
  }
  .toggle:focus-visible {
    outline: 2px solid #324fff;
    outline-offset: 2px;
  }
  :host([open]) .toggle {
    bottom: calc(var(--height) + 12px);
  }
  .drawer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483000;
    display: none;
    height: var(--height);
    background: #f3f3f3;
    box-shadow: 0 -2px 12px rgb(0 0 0 / 0.12);
  }
  :host([open]) .drawer {
    display: block;
  }
  .handle {
    position: absolute;
    top: -3px;
    left: 0;
    right: 0;
    height: 6px;
    cursor: ns-resize;
  }
  .handle:hover,
  :host([resizing]) .handle {
    background: #324fff55;
  }
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    border-top: 1px solid #d0d4e4;
  }
  :host([resizing]) iframe {
    pointer-events: none;
  }
`;

const load = (): DockState => {
  const fallback = {open: false, height: Math.round(innerHeight * 0.4)};
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null'
    ) as Partial<DockState> | null;
    return {...fallback, ...saved};
  } catch {
    // Storage can throw in sandboxed frames and private modes.
    return fallback;
  }
};

const save = (state: DockState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Remembering is a nicety; the dock works without it.
  }
};

const clamp = (height: number) =>
  Math.round(Math.min(Math.max(height, MIN_HEIGHT), innerHeight - 80));

/**
 * Adds the dock to the page. Call once `document.body` exists.
 *
 * @param panelUrl Where the panel answers, e.g. `http://localhost:3000/__lit-devtools/`.
 */
export const createDock = (panelUrl: string): Dock => {
  const state = load();
  const host = document.createElement('div');
  host.dataset.litDevtoolsDock = '';
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `<style>${STYLES}</style>
    <button class="toggle" type="button" title="Lit DevTools" aria-label="Lit DevTools" aria-expanded="false">${FLAME}</button>
    <div class="drawer"><div class="handle"></div></div>`;
  const toggle = root.querySelector('button')!;
  const drawer = root.querySelector<HTMLElement>('.drawer')!;
  const handle = root.querySelector<HTMLElement>('.handle')!;
  let frame: HTMLIFrameElement | undefined;

  const render = () => {
    host.toggleAttribute('open', state.open);
    host.style.setProperty('--height', `${clamp(state.height)}px`);
    toggle.setAttribute('aria-expanded', String(state.open));
    toggle.title = state.open ? 'Close Lit DevTools' : 'Lit DevTools';
  };

  const dock: Dock = {
    show(href) {
      if (frame === undefined) {
        frame = document.createElement('iframe');
        frame.title = 'Lit DevTools';
        frame.src = href ?? panelUrl;
        drawer.append(frame);
      } else if (href !== undefined) {
        // Only the hash differs from what is loaded, so the panel follows the
        // link in place rather than reloading.
        frame.src = href;
      }
      state.open = true;
      save(state);
      render();
    },
    hide() {
      state.open = false;
      save(state);
      render();
    },
    toggle() {
      if (state.open) dock.hide();
      else dock.show();
    },
  };

  toggle.addEventListener('click', () => dock.toggle());

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    host.toggleAttribute('resizing', true);
    const move = (event: PointerEvent) => {
      state.height = clamp(innerHeight - event.clientY);
      render();
    };
    const end = () => {
      host.toggleAttribute('resizing', false);
      handle.removeEventListener('pointermove', move);
      save(state);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end, {once: true});
    handle.addEventListener('pointercancel', end, {once: true});
  });

  document.body.append(host);
  render();
  if (state.open) dock.show();
  return dock;
};
