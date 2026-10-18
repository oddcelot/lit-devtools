/**
 * The Lit DevTools app in Astro's dev toolbar: the panel the plugin serves at
 * `/__lit/`, in an iframe in a toolbar window. Loaded in the page by Astro
 * from the path `astro.ts` registers, so it imports nothing.
 *
 * The panel's RPC asks for devframe's one-time code unless client auth is
 * off, and devframe only prompts for it in a top-level page, never in a
 * frame. So the window asks instead, when the server says a code is needed
 * and this browser holds no token yet, and hands the code to the panel in
 * its URL fragment, where devframe reads it. The link devframe prints with
 * the code opens the panel at `/__lit/` itself, whose token then serves this
 * window too.
 */

import {STANDALONE_PANEL_BASE as PANEL_URL} from '../devframe/standalone-panel.js';
import {
  ASTRO_TOOLBAR_APP_ID,
  type AstroToolbarAuth,
} from './toolbar-protocol.js';

/** The slice of Astro's `ToolbarAppEventTarget` the app uses. */
interface ToolbarApp {
  onToggled(callback: (options: {state: boolean}) => void): void;
  onToolbarPlacementUpdated(
    callback: (options: {placement: string}) => void
  ): void;
}

/** The slice of Astro's toolbar `serverHelpers` the app uses. */
interface ToolbarServer {
  send(event: string, payload: unknown): void;
  on<T>(event: string, callback: (payload: T) => void): void;
}

/** devframe's `DEVFRAME_OTP_URL_PARAM`. */
const OTP_PARAM = 'devframe_otp';
/** Where devframe's client keeps the token a code was exchanged for. */
const TOKEN_KEY = '__DEVFRAME_CONNECTION_AUTH_TOKEN__';

const STYLES = `
  astro-dev-toolbar-window {
    width: min(72rem, calc(100vw - 2rem));
    height: min(44rem, calc(100vh - 7rem));
    max-height: none;
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(52, 56, 65, 1);
    font-size: 0.8125rem;
  }
  header strong {
    margin-right: auto;
  }
  form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  [hidden] {
    display: none;
  }
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  input {
    width: 7rem;
    font: inherit;
    color: inherit;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(52, 56, 65, 1);
    border-radius: 0.25rem;
    padding: 0.2rem 0.4rem;
  }
  a {
    color: inherit;
  }
  iframe {
    flex: 1;
    width: 100%;
    border: 0;
    background: #fff;
  }
`;

/**
 * Where the toolbar is docked, from the root its canvases sit in. Astro's own
 * apps read it from its settings module, which an app can't import.
 */
const toolbarPlacement = (canvas: ShadowRoot): string | undefined =>
  (canvas.host.getRootNode() as ParentNode).querySelector<HTMLElement>(
    '#dev-toolbar-root'
  )?.dataset['placement'];

const hasToken = (): boolean => {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return false;
  }
};

export default {
  init(canvas: ShadowRoot, app: ToolbarApp, server: ToolbarServer) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    const panel = document.createElement('astro-dev-toolbar-window');
    panel.innerHTML = `
      <header>
        <strong>Lit DevTools</strong>
        <form hidden>
          <label>
            Code from the terminal
            <input name="code" inputmode="numeric" autocomplete="one-time-code" required />
          </label>
          <astro-dev-toolbar-button button-style="purple">Connect</astro-dev-toolbar-button>
        </form>
        <button type="button" hidden>Enter a new code</button>
        <a href="${PANEL_URL}" target="_blank" rel="noopener">Open in a tab</a>
      </header>
    `;
    canvas.append(style, panel);
    // The window sits at the default, centred, unless told where the
    // toolbar is.
    const placement = toolbarPlacement(canvas);
    if (placement !== undefined) panel.setAttribute('placement', placement);
    app.onToolbarPlacementUpdated(({placement}) => {
      panel.setAttribute('placement', placement);
    });
    const form = panel.querySelector('form')!;
    const input = form.querySelector('input')!;
    // For a token the server no longer accepts, after a restart that
    // cleared its storage: the panel then says it was denied.
    const newCode = panel.querySelector('header > button') as HTMLElement;
    newCode.addEventListener('click', () => {
      newCode.hidden = true;
      form.hidden = false;
      input.focus();
    });

    let frame: HTMLIFrameElement | undefined;
    /**
     * Whether the panel was handed a code typed in here.
     * It holds no token until it has exchanged the code, which can be after
     * the server's auth reply, so that reply alone would ask again.
     */
    let codeGiven = false;
    /**
     * Loads the panel, and again in a new frame when a code comes in for
     * it: a new fragment alone would navigate within the loaded panel,
     * which reads the code only as it connects.
     */
    const load = (code?: string) => {
      if (frame !== undefined && code === undefined) return;
      if (code !== undefined) {
        codeGiven = true;
        form.hidden = true;
        newCode.hidden = false;
      }
      frame?.remove();
      frame = document.createElement('iframe');
      frame.title = 'Lit DevTools';
      frame.src =
        code === undefined
          ? PANEL_URL
          : `${PANEL_URL}#${OTP_PARAM}=${encodeURIComponent(code)}`;
      panel.append(frame);
    };

    const connect = () => {
      const code = input.value.trim();
      if (code === '') return;
      input.value = '';
      load(code);
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      connect();
    });
    // Astro's button is a custom element, so it doesn't submit the form.
    form
      .querySelector('astro-dev-toolbar-button')!
      .addEventListener('click', connect);

    server.on<AstroToolbarAuth>(
      `${ASTRO_TOOLBAR_APP_ID}:auth`,
      ({required}) => {
        form.hidden = !required || codeGiven || hasToken();
        newCode.hidden = !required || !form.hidden;
      }
    );
    server.send(`${ASTRO_TOOLBAR_APP_ID}:auth-request`, {});

    app.onToggled(({state}) => {
      if (state) load();
    });
  },
};
