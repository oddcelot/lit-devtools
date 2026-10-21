// Before anything imports Lit, so server-rendered elements hydrate instead of
// rendering again.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import {hydrate} from '@lit-labs/ssr-client';
import {render} from 'lit';
import {regionsOf, type PageView} from '../page.ts';
import type {LiveMessage, PageData} from '../shared.ts';
import {api} from './api.ts';

const data = JSON.parse(
  document.querySelector('#page-data')!.textContent!
) as PageData;
const live = regionsOf(data)
  .filter((region) => region.hydrate)
  .map(
    (region) => [document.getElementById(region.id)!, region.render] as const
  );

// The same templates and data the server rendered: hydration adopts the DOM
// it finds rather than building it again.
let view: PageView = data;
for (const [root, template] of live) hydrate(template(view), root);

/** From here on, every change is a plain render of each live region. */
const update = (changes: Partial<PageView>) => {
  view = {...view, ...changes} as PageView;
  for (const [root, template] of live) render(template(view), root);
};

// The elements hydrate in the microtasks after `hydrate()`, each assuming
// its first render matches the server's HTML. Changing the data before they
// are done would make them believe a DOM that was never patched, so the
// first change waits a task.
setTimeout(() => {
  // Times switch from UTC to "2 minutes ago" now that the reader's clock is
  // known, and keep ticking.
  update({now: Date.now()});
  setInterval(() => update({now: Date.now()}), 30_000);
  connect();
});

// The form, on the book's page, stays server HTML until someone reaches for
// it. Removing `defer-hydration` hydrates it on the spot; a submit before
// that posts natively, which works too.
const form = document.querySelector('sign-form');
for (const type of ['pointerenter', 'focusin', 'touchstart']) {
  form?.addEventListener(type, () => form.removeAttribute('defer-hydration'), {
    once: true,
  });
}

const onMessage = (message: LiveMessage) => {
  if (message.type === 'online') {
    update({online: message.count});
  } else if (view.page === 'book') {
    if (view.entries.some((entry) => entry.id === message.entry.id)) return;
    update({
      entries: [message.entry, ...view.entries],
      fresh: [...(view.fresh ?? []), message.entry.id],
    });
  } else if (view.newerId === undefined && message.entry.id > view.entry.id) {
    // The newest signature had no newer one; now it has.
    update({newerId: message.entry.id});
  }
};

// Every reader subscribes to `/live`: new signatures and the reader count
// arrive here, for everyone, including the one who signed. After a dropped
// connection the list is fetched again, for what was signed meanwhile.
let socket: ReturnType<ReturnType<typeof api>['live']['subscribe']> | undefined;
let parked = false;

const connect = (retry = 500, reconnecting = false) => {
  const current = api().live.subscribe();
  socket = current;
  current.subscribe(({data}) => onMessage(data as LiveMessage));
  current.on('open', async () => {
    retry = 500;
    update({connection: 'live'});
    if (!reconnecting || view.page !== 'book') return;
    const {data: entries} = await api().api.entries.get();
    if (entries) update({entries});
  });
  current.on('close', () => {
    if (parked || current !== socket) return;
    update({connection: 'offline'});
    setTimeout(() => connect(Math.min(retry * 2, 10_000), true), retry);
  });
};

// Leaving the page can park it in the back/forward cache, frozen but whole:
// its socket would stay open and count it as a reader of a page nobody is
// on. So it hangs up as it goes, and dials again if Back brings it back.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) return;
  parked = true;
  socket?.close();
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  parked = false;
  connect(500, true);
});
