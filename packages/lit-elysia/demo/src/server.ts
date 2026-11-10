import {Elysia, t} from 'elysia';
import {LATENCY_COOKIE, latencyOf} from './latency.ts';
import {clearLoads, loads} from './load-log.ts';
import {addNote, allNotes} from './notes.ts';

/** The app the pages are added to: here, a small JSON API. */
export default new Elysia({prefix: '/api'})
  .get('/notes', () => allNotes())
  // Which pages' loads ran: the latency wait stops a page the client left.
  .get('/loads', () => loads())
  .delete('/loads', () => {
    clearLoads();
    return null;
  })
  .post(
    '/notes',
    {body: t.Object({title: t.String(), body: t.String()})},
    ({body}) => addNote(body)
  );

/** Waits `ms`, or less: until the client goes, if it does first. */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** The visitor's name from its cookie, when it has one. */
const visitorOf = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined;

/**
 * The pages' own context: every load and action gets `site`, `visitor` and
 * `latency`, typed; the guard runs before them, then the simulated latency.
 */
export const context = new Elysia({name: 'demo/context'})
  .decorate('site', {name: 'Notes'})
  .derive(({cookie}) => ({
    visitor: visitorOf(cookie['visitor']?.value),
    latency: latencyOf(cookie[LATENCY_COOKIE]?.value),
  }))
  // The guard: the private page wants a name first.
  .onBeforeHandle(({request, visitor, redirect}) =>
    new URL(request.url).pathname === '/private' && !visitor
      ? redirect('/visitor?from=private', 303)
      : undefined
  )
  // The latency, unless the client leaves during it: the router moved on, so
  // the page's loads never run.
  .onBeforeHandle(async ({latency, request}) => {
    await wait(latency, request.signal);
    if (request.signal.aborted) return new Response(null, {status: 499});
  });
