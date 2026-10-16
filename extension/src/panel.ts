/**
 * The Lit tab Lit Inspector adds to DevTools: the panel SPA the dev server
 * serves, hosted here with no server behind it. The Lit devframe runs in this
 * page
 * (`createLocalLitHost`) and reads the inspected page over the extension's
 * port, so the views get the same RPC client they get from a dev server.
 *
 * Until the inspected site is enabled the tab shows only that: the site, its
 * status, and the button that enables it. Enabling asks for the site's host
 * permission first, unless the extension already holds it. Only an extension
 * page can, inside the user's click, so it happens here and not in the
 * background, which is then asked to register the scripts. The page is
 * reloaded so they run at `document_start` of a fresh document.
 *
 * Firefox refuses permission requests from DevTools (bugzil.la/1796933), so
 * there the toolbar popup (`popup.ts`) asks instead, and this tab says so
 * until the permission is there. Either way the tab follows the enabled
 * origins in `storage.local`, so a site enabled elsewhere opens the panel.
 *
 * Once enabled, the order matters:
 *
 * 1. the host is created on a port that has not dialled yet, so its page link
 *    is listening before anything can arrive (the runtime announces itself
 *    once, and the host drops what comes before its `setup()` is done);
 * 2. `useLocalClient()` hands its client to the panel, before any view can
 *    call `litRpc()` and look for a dev server instead, and `useBrand()` puts
 *    the extension's name and mark in the header;
 * 3. the SPA is imported and `<lit-devtools-panel>` mounted;
 * 4. the port dials and says hello, and the background has the page
 *    re-announce itself.
 *
 * The background's own status messages share the port with the page's
 * traffic; they are taken off it here and drive the bar under the panel, and
 * never reach the host. A page that navigates re-announces itself on its new
 * document, and the host switches pages as it does on every carrier.
 *
 * The details pane's "Reveal in Elements" and its source links go to
 * DevTools' own panels from here, since only this page holds `chrome.devtools`
 * (`element-revealer.ts`, `source-opener.ts`).
 *
 * Test seam: opened as a plain tab (the e2e does, since DevTools itself is not
 * scriptable) there is no `chrome.devtools`, so the inspected tab comes from
 * a `?tabId=` query parameter and its origin from `chrome.tabs`, which only
 * reveals it for a site the extension holds the permission for. DevTools
 * never adds the parameter.
 */

import {version} from '../../package.json';
import {createLocalLitHost} from '../../src/lib/devframe/port-link.js';
import type {PortLike} from '../../src/lib/devframe/port-link.js';
import {useBrand} from '../../src/panel/brand.js';
import {useLocalClient} from '../../src/panel/client.js';
import {useElementRevealer} from '../../src/panel/element-revealer.js';
import {useBreakpoints, type Breakpoints} from '../../src/panel/breakpoints.js';
import {useSourceOpener} from '../../src/panel/source-opener.js';
import {
  BREAKPOINTS_KEY,
  ELEMENT_BY_ID_KEY,
  LIT_ID_OF_KEY,
} from '../../src/types/inspector.js';
import type {ElementSource} from '../../src/types/inspector.js';
import {loadedUrlFor} from './loaded-source.js';
import {CHANNEL_PAGE_STATUS, PANEL_PORT} from './protocol.js';
import type {
  OriginStatus,
  PageStatus,
  PanelHello,
  RegistryRequest,
} from './protocol.js';
import {
  ENABLED_ORIGINS_KEY,
  normalizeOrigin,
  patternsKeepPort,
} from './registry.js';
import {createSourceMapResolver} from '../../src/lib/devframe/source-maps.js';
import {createLinkedDocsSource} from '../../src/lib/component-docs/linked.js';
import {createChromeStorage} from './storage.js';
import {
  MANIFEST_IGNORED_KEY,
  MANIFEST_URLS_KEY,
  parseManifestUrl,
  readIgnoredManifests,
  readManifests,
  setManifestIgnored,
  writeManifests,
} from './manifest-url.js';
import {
  added,
  enabledUrls,
  entriesFor,
  moved,
  removed,
  toStored,
  toggled,
  type ManifestEntry,
  type StoredManifest,
} from './manifest-list.js';
import {findManifests, manifestCandidates} from './manifest-discovery.js';
import {useManifestSetting} from '../../src/panel/manifest-setting.js';

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const setupEl = $('setup');
const originEl = $('origin');
const statusEl = $('status');
const enableButton = $<HTMLButtonElement>('enable');
const hintEl = $('hint');
const barEl = $('bar');
const pageEl = $('page');
const reloadButton = $<HTMLButtonElement>('reload');
const disableButton = $<HTMLButtonElement>('disable');
const manifestNudge = $('manifest-nudge');
const manifestNudgeText = $('manifest-nudge-text');
const manifestNudgeOpen = $<HTMLButtonElement>('manifest-nudge-open');
const manifestNudgeLater = $<HTMLButtonElement>('manifest-nudge-later');

// Absent outside DevTools; see the test seam above.
const devtools = chrome.devtools as typeof chrome.devtools | undefined;
const tabId =
  devtools?.inspectedWindow.tabId ??
  Number(new URLSearchParams(location.search).get('tabId'));

let origin: string | undefined;
let current: OriginStatus | undefined;
/** The user's arrangement of this site's manifests; see `manifest-list.ts`. */
let stored: StoredManifest[] = [];
/** Tells the panel to ask for its docs again; set once the host is up. */
let docsChanged: (() => void) | undefined;
let booted: Promise<void> | undefined;

// Firefox can't ask for a permission from DevTools (see the header), and
// its sites are hosts on any port (see `normalizeOrigin`).
const canRequest = patternsKeepPort(location.href);
const site = (url: string) => normalizeOrigin(url, canRequest);

const request = (message: RegistryRequest): Promise<OriginStatus> =>
  chrome.runtime.sendMessage(message);

const inspectedOrigin = async (): Promise<string | undefined> => {
  if (devtools === undefined) {
    const {url} = await chrome.tabs.get(tabId);
    return url === undefined ? undefined : site(url);
  }
  return new Promise((resolve) =>
    devtools.inspectedWindow.eval<string>(
      'location.origin',
      (result, exception) =>
        resolve(exception ? undefined : site(String(result)))
    )
  );
};

const reloadPage = (): void => {
  if (devtools === undefined) void chrome.tabs.reload(tabId);
  else devtools.inspectedWindow.reload({});
};

const isPageStatus = (
  message: unknown
): message is {channel: string; data: PageStatus} =>
  typeof message === 'object' &&
  message !== null &&
  (message as {channel?: unknown}).channel === CHANNEL_PAGE_STATUS;

/**
 * The panel's end of the route to the page, as one {@link PortLike} that
 * outlives the Chrome port under it: when the service worker restarts or the
 * extension reloads, the port drops and is dialled again, and the host,
 * bound once, never notices. No `onDisconnect` for the same reason.
 */
const pagePort = (
  onStatus: (connected: boolean) => void
): {port: PortLike; dial: () => void} => {
  const listeners: Array<(message: unknown) => void> = [];
  let current: chrome.runtime.Port | undefined;
  const dial = (): void => {
    const port = chrome.runtime.connect({name: PANEL_PORT});
    current = port;
    port.onMessage.addListener((message: unknown) => {
      if (isPageStatus(message)) onStatus(message.data.connected);
      else for (const listener of listeners) listener(message);
    });
    port.onDisconnect.addListener(() => {
      current = undefined;
      onStatus(false);
      setTimeout(dial, 500);
    });
    const hello: PanelHello = {tabId};
    port.postMessage(hello);
  };
  return {
    dial,
    port: {
      postMessage(message) {
        try {
          current?.postMessage(message);
        } catch {
          // Gone; its onDisconnect dials again.
        }
      },
      onMessage: {addListener: (listener) => void listeners.push(listener)},
    },
  };
};

const showPageStatus = (connected: boolean): void => {
  barEl.classList.toggle('disconnected', !connected);
  pageEl.textContent = connected
    ? `Lit runtime connected on ${origin ?? 'this page'}`
    : 'No Lit runtime in this page. Reload it to inject one.';
  reloadButton.hidden = connected;
};

// Where a component the plugin never stamped is defined: its define call's
// stack, mapped through the page's sourcemaps. Fetched from here, which holds
// the enabled site's host permission, and only from that site; forgotten
// when the page navigates.
const sourceMaps = createSourceMapResolver({
  fetch: (url) => fetch(url),
  allows: (url) => origin !== undefined && site(url) === origin,
});

/**
 * Runs `func` in the inspected page for a list of strings: through
 * DevTools' `eval` in the Lit tab, with `chrome.scripting` outside DevTools
 * (the test seam). An exception or any other result reads as empty.
 */
const stringsInPage = async (func: () => string[]): Promise<string[]> => {
  const valid = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((v) => typeof v === 'string');
  if (devtools === undefined) {
    const [result] = await chrome.scripting.executeScript({
      target: {tabId},
      func,
    });
    return valid(result?.result) ? result.result : [];
  }
  return new Promise((resolve) =>
    devtools.inspectedWindow.eval<string[]>(
      `(${func.toString()})()`,
      (value, exception) => resolve(!exception && valid(value) ? value : [])
    )
  );
};

/**
 * The page's `<link rel="custom-elements-manifest">` URLs (`MANIFEST_LINK_REL`,
 * spelled out: the function runs in the page). `href` reads back absolute,
 * resolved against the document's base URL.
 */
const manifestLinks = (): Promise<string[]> =>
  stringsInPage(() =>
    [
      ...document.querySelectorAll<HTMLLinkElement>(
        'link[rel~="custom-elements-manifest"]'
      ),
    ].map((l) => l.href)
  );

/** The scripts the page loaded: its `<script src>` tags, then modules. */
const pageScripts = (): Promise<string[]> =>
  stringsInPage(() => [
    ...new Set([
      ...[...document.scripts].map((s) => s.src).filter((src) => src !== ''),
      ...performance
        .getEntriesByType('resource')
        .filter(
          (e) =>
            (e as PerformanceResourceTiming).initiatorType === 'script' ||
            /\.m?js(?:[?#]|$)/.test(e.name)
        )
        .map((e) => e.name),
    ]),
  ]);

/** The switched-on manifests, the page's links among them, in order. */
const docsManifests = async (): Promise<string[]> =>
  enabledUrls(entriesFor(stored, await manifestLinks()));

/** The inspected page's URL, to resolve a path the user typed against. */
const inspectedUrl = async (): Promise<string | undefined> => {
  if (devtools === undefined) return (await chrome.tabs.get(tabId)).url;
  return new Promise((resolve) =>
    devtools.inspectedWindow.eval<string>('location.href', (url, exception) =>
      resolve(exception ? undefined : String(url))
    )
  );
};

// Component docs from the manifests the page links to, under the same rule
// as sourcemaps: fetched from here, and only from the enabled site.
const manifestDocs = createLinkedDocsSource({
  links: docsManifests,
  fetchText: async (url) => {
    const response = await fetch(url);
    return response.ok ? response.text() : undefined;
  },
  allows: (url) => readable(url),
});

/**
 * Opens `url` in DevTools' Sources panel at a 0-based line and column,
 * resolving whether DevTools found a resource by that URL.
 */
const openResource = (
  panels: typeof chrome.devtools.panels,
  url: string,
  line0: number,
  column0: number
): Promise<boolean> =>
  new Promise((resolve) =>
    panels.openResource(url, line0, column0, (...args: unknown[]) => {
      const result = args[0] as {isError?: boolean} | undefined;
      resolve(chrome.runtime.lastError === undefined && !result?.isError);
    })
  );

/**
 * The URL the page loaded for a file path the plugin stamped, among every
 * resource DevTools knows (the list the Sources panel shows, which Resource
 * Timing would cap). `undefined` when DevTools cannot list them or none match.
 */
const loadedUrl = (file: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    const inspected = devtools?.inspectedWindow;
    if (typeof inspected?.getResources !== 'function')
      return resolve(undefined);
    inspected.getResources((resources) =>
      resolve(
        loadedUrlFor(
          file,
          resources.map((resource) => resource.url)
        )
      )
    );
  });

/**
 * A location in the Sources panel. A plugin-stamped file path has no URL, so
 * it is matched to the one the page loaded it from (and nothing opens when
 * none matches). A resolved location opens the original source when DevTools
 * has loaded the page's sourcemap, else the generated script at the define
 * call, which DevTools always has and maps itself if it can.
 */
const openInSources = async (
  panels: typeof chrome.devtools.panels,
  location: ElementSource
): Promise<void> => {
  if (location.url === undefined) {
    const url = await loadedUrl(location.file);
    if (url !== undefined) {
      await openResource(
        panels,
        url,
        location.line - 1,
        (location.column ?? 1) - 1
      );
    }
    return;
  }
  if (
    await openResource(
      panels,
      location.url,
      location.line - 1,
      (location.column ?? 1) - 1
    )
  ) {
    return;
  }
  const generated = location.generated;
  if (generated === undefined) return;
  await openResource(
    panels,
    generated.url,
    generated.line - 1,
    generated.column - 1
  );
};

/**
 * Selects the element with the runtime's id in the Elements panel, by
 * evaluating in the page: `inspect()` is a console utility, so it only exists
 * there, and the runtime's lookup (`ELEMENT_BY_ID_KEY`) is how the id becomes
 * a node. Nothing happens for an element that is gone.
 */
const revealInElements = (
  devtools: typeof chrome.devtools,
  id: number
): Promise<void> =>
  new Promise((resolve) =>
    devtools.inspectedWindow.eval(
      `(() => { const el = globalThis[Symbol.for(${JSON.stringify(
        ELEMENT_BY_ID_KEY.description
      )})]?.(${JSON.stringify(id)}); if (el) inspect(el); return el !== undefined; })()`,
      () => resolve()
    )
  );

/**
 * The page runtime's breakpoints, reached by evaluating in the page like
 * {@link revealInElements}. DevTools is open whenever this panel is, so the
 * runtime's `debugger` statement pauses there. A page without the runtime
 * (or an older one) answers false, and nothing is armed.
 */
const pageBreakpoints = (devtools: typeof chrome.devtools): Breakpoints => {
  const call = (expression: string): Promise<boolean> =>
    new Promise((resolve) =>
      devtools.inspectedWindow.eval<boolean>(
        `(() => { const bp = globalThis[Symbol.for(${JSON.stringify(
          BREAKPOINTS_KEY.description
        )})]; return bp === undefined ? false : ${expression}; })()`,
        (result, exception) => resolve(!exception && result === true)
      )
    );
  return {
    set: (id, target, on) =>
      call(`bp.set(${JSON.stringify(id)}, ${JSON.stringify(target)}, ${on})`),
    clear: async () => {
      await call('(bp.clear(), true)');
    },
  };
};

/**
 * Follows the Elements panel: when its selection (`$0`) is an element the
 * Components tree lists, or sits inside one, the Lit panel selects that row,
 * as a deep link would. `location.replace` with a fragment fires `hashchange` without a
 * history entry. Nothing happens for a node no tree row encloses.
 */
const followElementsSelection = (devtools: typeof chrome.devtools): void => {
  const elements = devtools.panels.elements as
    | typeof chrome.devtools.panels.elements
    | undefined;
  elements?.onSelectionChanged.addListener(() => {
    devtools.inspectedWindow.eval<number | undefined>(
      `globalThis[Symbol.for(${JSON.stringify(
        LIT_ID_OF_KEY.description
      )})]?.($0)`,
      (id, exception) => {
        if (exception || typeof id !== 'number') return;
        const params = new URLSearchParams({
          tab: 'components',
          component: String(id),
        });
        location.replace(`#${params}`);
      }
    );
  });
};

const boot = async (): Promise<void> => {
  setupEl.hidden = true;
  const {port, dial} = pagePort(showPageStatus);
  const client = await createLocalLitHost({
    port,
    version,
    storage: createChromeStorage(chrome.storage.local),
    resolveDefineSource: (frames) => sourceMaps.resolve(frames),
    locateTemplate: (site) => sourceMaps.locate(site),
    docsSource: (args) => manifestDocs.componentDocs(args),
    onDocsSourceChanged: (notify) => {
      docsChanged = notify;
    },
  });
  useLocalClient(client);
  // Outside DevTools (the e2e's plain tab) there is no Sources panel, and a
  // browser may lack `openResource` (Firefox); locations stay as they are then.
  const panels = devtools?.panels;
  if (typeof panels?.openResource === 'function') {
    useSourceOpener((location) => openInSources(panels, location));
  }
  // "Reveal in Elements" evaluates in the page and calls DevTools' `inspect()`
  // there, which Chrome and Firefox both provide; following the Elements
  // selection back evaluates on `$0` the same way.
  if (
    devtools !== undefined &&
    typeof devtools.inspectedWindow.eval === 'function'
  ) {
    useElementRevealer((id) => revealInElements(devtools, id));
    useBreakpoints(pageBreakpoints(devtools));
    followElementsSelection(devtools);
  }
  // The extension's own name and mark, not the Lit project's.
  useBrand({name: 'Lit Inspector', iconUrl: chrome.runtime.getURL('icon.svg')});
  await import('../../src/panel/main.js');
  document.body.prepend(document.createElement('lit-devtools-panel'));
  barEl.hidden = false;
  dial();
  // Links are in the page's head already; its scripts may still be loading.
  void readLinks();
  suggestSoon();
};

const render = (status: OriginStatus | undefined): void => {
  if (status?.enabled) {
    booted ??= boot();
    return;
  }
  // The panel cannot be torn down and handed a new client, so a site that
  // stopped being enabled under it gets a fresh tab instead.
  if (booted !== undefined) {
    location.reload();
    return;
  }
  setupEl.hidden = false;
  originEl.textContent = origin ?? '(not a web page)';
  statusEl.textContent =
    status === undefined
      ? 'unavailable'
      : (status.error ?? (status.permitted ? 'disabled' : 'not permitted'));
  const needsPopup = !canRequest && status?.permitted !== true;
  enableButton.hidden = needsPopup;
  enableButton.disabled = status === undefined;
  hintEl.hidden = !needsPopup || status === undefined;
};

/** Manifests found beside the page's scripts; see `manifest-discovery.ts`. */
let hits: string[] = [];
/** Found manifests the user ignores on this site; see `manifest-url.ts`. */
let ignored: string[] = [];
/** The footer's nudge was put off for this panel; Settings still offers. */
let snoozed = false;
/** The manifests the page links, as last read. */
let linked: string[] = [];
const manifestListeners = new Set<() => void>();

/** The site's list as it stands for the page. */
const entries = (): ManifestEntry[] => entriesFor(stored, linked);

/** Other sites' origins the browser lets the panel fetch manifests from. */
let granted = new Set<string>();

/** The origin of `url` when it is on another site than the inspected one. */
const otherSiteOf = (url: string): string | undefined => {
  try {
    const at = new URL(url);
    return site(at.href) === origin ? undefined : at.origin;
  } catch {
    return undefined;
  }
};

const accessPattern = (other: string) => `${other}/*`;

/** Whether the panel may fetch `url`: on the site, or on a granted one. */
function readable(url: string): boolean {
  if (origin === undefined) return false;
  const other = otherSiteOf(url);
  return other === undefined || granted.has(other);
}

/** Check which other sites in the list the browser grants access to. */
const refreshAccess = async (): Promise<void> => {
  const others = new Set(
    entries()
      .map((e) => otherSiteOf(e.url))
      .filter((o): o is string => o !== undefined)
  );
  const next = new Set<string>();
  for (const other of others) {
    if (await chrome.permissions.contains({origins: [accessPattern(other)]})) {
      next.add(other);
    }
  }
  const changed = [...next].join(' ') !== [...granted].join(' ');
  granted = next;
  if (changed) docsMayDiffer();
  manifestChanged();
};

/**
 * Ask for access to the other site `input` names, when it is an absolute
 * URL there. Must run before anything awaits: the browser asks only during
 * the user's click. `undefined` when there is nothing to ask.
 */
const askAccessFor = (input: string): Promise<boolean> | undefined => {
  if (!canRequest) return undefined;
  let at: URL;
  try {
    at = new URL(input.trim());
  } catch {
    return undefined;
  }
  const other = otherSiteOf(at.href);
  if (other === undefined || granted.has(other)) return undefined;
  return chrome.permissions.request({origins: [accessPattern(other)]});
};

/**
 * Give back access to the other site `url` was on, once no entry of the
 * list needs it and the user has not enabled that site itself.
 */
const releaseAccess = async (
  url: string,
  rest: ManifestEntry[]
): Promise<void> => {
  const other = otherSiteOf(url);
  if (other === undefined) return;
  if (rest.some((e) => otherSiteOf(e.url) === other)) return;
  const enabled = (await chrome.storage.local.get(ENABLED_ORIGINS_KEY))[
    ENABLED_ORIGINS_KEY
  ];
  if (Array.isArray(enabled) && enabled.includes(site(`${other}/`))) return;
  // A host granted at install rather than on request can't be given back.
  await chrome.permissions
    .remove({origins: [accessPattern(other)]})
    .catch(() => false);
};

/** Found manifests neither listed nor ignored: on offer. */
const offered = (): string[] => {
  const listed = new Set(entries().map((e) => e.url));
  return hits.filter((url) => !listed.has(url) && !ignored.includes(url));
};

/** Tell Settings, and nudge in the footer while any is on offer. */
const manifestChanged = (): void => {
  const count = offered().length;
  const nudge = count > 0 && !snoozed;
  manifestNudge.hidden = !nudge;
  pageEl.hidden = nudge;
  manifestNudgeText.textContent =
    count === 1
      ? 'Found a Custom Elements Manifest for this site'
      : `Found ${count} Custom Elements Manifests for this site`;
  for (const listener of manifestListeners) listener();
};

/** The docs the panel shows may come from other manifests now. */
const docsMayDiffer = (): void => {
  manifestDocs.reset();
  docsChanged?.();
};

/** What storage holds for the site: the user's list and ignored ones. */
const loadManifestUrl = async (): Promise<void> => {
  const storage = chrome.storage.local;
  const [nextStored, nextIgnored] =
    origin === undefined
      ? [[], []]
      : await Promise.all([
          readManifests(storage, origin),
          readIgnoredManifests(storage, origin),
        ]);
  ignored = nextIgnored;
  const changed = JSON.stringify(nextStored) !== JSON.stringify(stored);
  stored = nextStored;
  manifestChanged();
  if (changed) docsMayDiffer();
  await refreshAccess();
};

/** Read the page's manifest links again, for the list Settings shows. */
const readLinks = async (): Promise<void> => {
  const links = await manifestLinks();
  if (links.join('\n') !== linked.join('\n')) {
    linked = links;
    docsMayDiffer();
  }
  await refreshAccess();
};

/**
 * Read the page's links again, then look for the manifests the site hosts
 * beside its scripts.
 */
const suggestManifest = async (): Promise<void> => {
  await readLinks();
  const at = origin;
  if (at === undefined) return;
  const candidates = manifestCandidates(
    await pageScripts(),
    (url) => site(url) === at
  );
  const found = await findManifests(candidates, (url) => fetch(url));
  // The site may have changed meanwhile.
  if (origin === at) hits = found;
  manifestChanged();
};

/** After the page has had time to load its scripts. */
const suggestSoon = (): void => {
  setTimeout(() => void suggestManifest(), 1500);
};

/**
 * Store `change` applied to the site's list. Storage's listener below
 * loads it, here and in other windows.
 */
const saveEntries = async (
  change: (list: ManifestEntry[]) => ManifestEntry[]
): Promise<void> => {
  if (origin === undefined) return;
  await writeManifests(
    chrome.storage.local,
    origin,
    toStored(change(entries()), stored)
  );
};

const setIgnored = async (url: string, ignore: boolean): Promise<void> => {
  if (origin !== undefined) {
    await setManifestIgnored(chrome.storage.local, origin, url, ignore);
  }
};

// The Settings tab's Component docs section; the panel renders it.
useManifestSetting({
  state: () =>
    origin === undefined
      ? undefined
      : {
          site: origin,
          entries: entries().map((e) =>
            readable(e.url)
              ? e
              : {...e, access: canRequest ? 'grant' : 'unavailable'}
          ),
          found: offered(),
          ignored,
        },
  async add(input) {
    // First, while the click still counts as one.
    const asking = askAccessFor(input);
    const base = await inspectedUrl();
    if (origin === undefined || base === undefined) return 'No page to read';
    const parsed = parseManifestUrl(input, base, origin, site, canRequest);
    if ('error' in parsed) return parsed.error;
    if (entries().some((e) => e.url === parsed.url)) return 'Already listed';
    if (parsed.otherSite && !readable(parsed.url) && !(await asking)) {
      return `Access to ${new URL(parsed.url).host} was not granted`;
    }
    await saveEntries((list) => added(list, parsed.url));
    return undefined;
  },
  async allow(url) {
    const other = otherSiteOf(url);
    if (other === undefined) return undefined;
    if (!canRequest) return "This browser can't grant access from DevTools";
    const ok = await chrome.permissions.request({
      origins: [accessPattern(other)],
    });
    return ok ? undefined : `Access to ${new URL(other).host} was not granted`;
  },
  async remove(url) {
    const rest = removed(entries(), url);
    await saveEntries(() => rest);
    await releaseAccess(url, rest);
  },
  toggle: (url, enabled) => saveEntries((list) => toggled(list, url, enabled)),
  move: (url, by) => saveEntries((list) => moved(list, url, by)),
  async use(url) {
    await saveEntries((list) => added(list, url));
    await setIgnored(url, false);
  },
  ignore: (url) => setIgnored(url, true),
  reset: (url) => setIgnored(url, false),
  subscribe(listener) {
    manifestListeners.add(listener);
    return () => manifestListeners.delete(listener);
  },
});

manifestNudgeOpen.addEventListener('click', () => {
  location.replace(`#${new URLSearchParams({tab: 'settings'})}`);
});

manifestNudgeLater.addEventListener('click', () => {
  snoozed = true;
  manifestChanged();
});

const refresh = async (): Promise<void> => {
  origin = await inspectedOrigin();
  await loadManifestUrl();
  current =
    origin === undefined
      ? undefined
      : await request({type: 'lit:status', origin});
  render(current);
};

enableButton.addEventListener('click', async () => {
  if (origin === undefined) return;
  // First thing in the handler: the request must run inside the click.
  if (current?.permitted !== true) {
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`],
    });
    if (!granted) return;
  }
  const status = await request({type: 'lit:enable', origin});
  render(status);
  if (status.enabled) reloadPage();
});

disableButton.addEventListener('click', async () => {
  if (origin === undefined) return;
  await request({type: 'lit:disable', origin});
  reloadPage();
  location.reload();
});

reloadButton.addEventListener('click', reloadPage);

// Access to another site's manifest, granted or taken back here or in the
// browser's extension settings.
chrome.permissions.onAdded.addListener(() => void refreshAccess());
chrome.permissions.onRemoved.addListener(() => void refreshAccess());

// The site may be enabled or disabled from somewhere else: the Firefox
// popup, or another DevTools window on the same site.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (ENABLED_ORIGINS_KEY in changes) void refresh();
  else if (MANIFEST_URLS_KEY in changes || MANIFEST_IGNORED_KEY in changes) {
    void loadManifestUrl();
  }
});

// A navigation to another site may land somewhere not enabled, or enabled
// where this one was not; a reload of the same site changes nothing here.
devtools?.network.onNavigated.addListener((url) => {
  // The new document's scripts may differ under the same URLs.
  sourceMaps.reset();
  manifestDocs.reset();
  hits = [];
  manifestChanged();
  if (site(url) !== origin) {
    void refresh().then(() => {
      if (booted !== undefined) suggestSoon();
    });
  } else if (booted !== undefined) suggestSoon();
});
void refresh();
