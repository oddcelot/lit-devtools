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
 *
 * In a frame (a cloud IDE's preview) devframe cannot prompt for the one-time
 * code, so the dock asks for it: the button carries a dot, and the drawer
 * holds a field for the code instead of the panel until the server trusts the
 * page. The panel then loads with the token the page stored.
 *
 * A full page load takes the panel with it. The dock keeps what it can
 * across one: open or not, its height, and the panel's tab, read off the
 * panel's hash as the page goes. Not the selection: its ids name elements
 * of the page that is leaving, and on the next one could name others.
 */

import type {CodeRequest} from './rpc-transport.js';

export interface Dock {
  /** Open the drawer, on `href` when given (a hash change keeps the panel). */
  show(href?: string): void;
  hide(): void;
  toggle(): void;
  /** Ask the reader for the one-time code, for a page that cannot prompt. */
  askForCode(auth: CodeRequest): void;
}

const STORAGE_KEY = 'lit-devtools:dock';
const MIN_HEIGHT = 160;

interface DockState {
  open: boolean;
  height: number;
  /** The panel's tab when the last page went (its `tab=` hash parameter). */
  tab?: string;
}

const FLAME = `<svg viewBox="0 0 160 200" aria-hidden="true"><path fill="#00e8ff" d="M40 120l20-60l90 90l-30 50l-40-40h-20"/><path fill="#283198" d="M80 160v-80l40-40v80M0 160l40 40l20-40l-20-40h-20"/><path fill="#324fff" d="M40 120v-80l40-40v80M120 200v-80l40-40v80M0 160v-80l40 40"/><path fill="#00ffff" d="M40 200v-80l40 40"/></svg>`;

const STYLES = `
  :host {
    all: initial;
    --height: 40vh;
    display: block;
  }
  /* The host sits last in <body>. Open, it takes the drawer's height, so the
     page can scroll its last content up above the drawer. */
  :host([open]) {
    height: var(--height);
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
  :host([needs-code]) .toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    right: 2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #e8590c;
    box-shadow: 0 0 0 2px #fff;
  }
  :host([needs-code]) iframe {
    display: none;
  }
  .auth {
    display: none;
    height: 100%;
    place-content: center;
    gap: 0.6rem;
    font: 14px/1.4 system-ui, sans-serif;
    color: #1f2335;
    text-align: center;
  }
  :host([needs-code]) .auth {
    display: grid;
  }
  .auth p {
    margin: 0;
  }
  .auth form {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }
  .auth input {
    width: 9ch;
    font: 600 16px ui-monospace, monospace;
    letter-spacing: 0.15em;
    padding: 0.4rem 0.6rem;
    border: 1px solid #c3c8da;
    border-radius: 6px;
  }
  .auth button {
    font: 600 14px system-ui, sans-serif;
    padding: 0.4rem 0.9rem;
    border: 0;
    border-radius: 6px;
    background: #324fff;
    color: #fff;
    cursor: pointer;
  }
  .auth .link {
    background: none;
    color: #324fff;
    padding: 0;
    font-weight: 400;
    text-decoration: underline;
  }
  .auth [role='alert'] {
    min-height: 1.4em;
    color: #c92a2a;
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
    <div class="drawer"><div class="handle"></div>
      <div class="auth">
        <p><strong>Lit DevTools</strong> needs the code your dev server printed.</p>
        <form>
          <input name="code" inputmode="numeric" autocomplete="one-time-code" aria-label="Code" required />
          <button type="submit">Connect</button>
        </form>
        <p role="alert"></p>
        <p><button class="link" type="button">Print a new code</button></p>
      </div>
    </div>`;
  const toggle = root.querySelector('button')!;
  const drawer = root.querySelector<HTMLElement>('.drawer')!;
  const handle = root.querySelector<HTMLElement>('.handle')!;
  let frame: HTMLIFrameElement | undefined;
  /** Waiting for the code: the panel would not be trusted either. */
  let needsCode = false;
  /** Where to open the panel once the code is in. */
  let pending: string | undefined;
  // `?dock` tells the panel someone reads its hash, so it keeps it current.
  const framed = (hash: string) => {
    const url = new URL(panelUrl);
    url.search = 'dock';
    url.hash = hash;
    return url.href;
  };

  const render = () => {
    host.toggleAttribute('open', state.open);
    host.style.setProperty('--height', `${clamp(state.height)}px`);
    toggle.setAttribute('aria-expanded', String(state.open));
    toggle.title = state.open ? 'Close Lit DevTools' : 'Lit DevTools';
  };

  const dock: Dock = {
    show(href) {
      if (needsCode) {
        pending = href ?? pending;
        root.querySelector('input')!.focus();
      } else if (frame === undefined) {
        frame = document.createElement('iframe');
        frame.title = 'Lit DevTools';
        frame.src = framed(
          href === undefined
            ? state.tab === undefined
              ? ''
              : `#${new URLSearchParams({tab: state.tab})}`
            : new URL(href).hash
        );
        drawer.append(frame);
      } else if (href !== undefined) {
        // Only the hash differs from what is loaded, so the panel follows the
        // link in place rather than reloading.
        frame.src = framed(new URL(href).hash);
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
    askForCode(auth) {
      needsCode = true;
      host.toggleAttribute('needs-code', true);
      const form = root.querySelector('form')!;
      const input = root.querySelector('input')!;
      const alert = root.querySelector('[role="alert"]')!;
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        alert.textContent = '';
        if (!(await auth.submit(input.value))) {
          alert.textContent =
            'That code did not work. Check it, or print a new one.';
          return;
        }
        needsCode = false;
        host.toggleAttribute('needs-code', false);
        // A panel loaded while the page was untrusted asked for trust in vain.
        frame?.remove();
        frame = undefined;
        if (state.open) dock.show(pending);
      });
      root.querySelector('.link')!.addEventListener('click', async () => {
        await auth.reissue();
        alert.textContent = "A new code is in your dev server's output.";
        input.value = '';
        input.focus();
      });
    },
  };

  toggle.addEventListener('click', () => dock.toggle());

  addEventListener('pagehide', () => {
    if (frame === undefined) return;
    try {
      const params = new URLSearchParams(
        frame.contentWindow!.location.hash.replace(/^#/, '')
      );
      state.tab = params.get('tab') ?? undefined;
      save(state);
    } catch {
      // A panel on another origin keeps its hash to itself.
    }
  });

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
