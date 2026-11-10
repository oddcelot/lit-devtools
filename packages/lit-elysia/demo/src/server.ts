import {openapi} from '@elysia/openapi';
import {Elysia, sse, status, t} from 'elysia';
import {LATENCY_COOKIE, latencyOf} from './latency.ts';
import {clearLoads, loads} from './load-log.ts';
import {addNote, allNotes, findNote, notesAdded, noteTitled} from './notes.ts';

/** The visitor's name from its cookie, when it has one. */
const visitorOf = (value: unknown) =>
  typeof value === 'string' && value ? value : undefined;

/** What the API answers, for the docs and for checking its answers. */
const Note = t.Object({
  id: t.Number(),
  title: t.String(),
  body: t.String(),
  createdAt: t.Date(),
});
const Problem = t.Object({message: t.String()});

/**
 * A macro: a route that asks for `{auth: true}` gets `visitor`, the name
 * from the cookie, as a string, or answers a typed 401 without one.
 */
const auth = new Elysia({name: 'demo/auth'}).macro({
  auth: {
    derive: ({cookie}) => {
      const visitor = visitorOf(cookie['visitor']?.value);
      return visitor
        ? {visitor}
        : status(401, {message: 'Tell the site your name first.'});
    },
  },
});

/**
 * The app the pages are added to: here, a small JSON API. Its errors are
 * part of its types: `status(404, ...)` reaches the Eden client as an
 * `error` it can narrow by status, each with its own body.
 */
export default new Elysia({prefix: '/api'})
  // Docs for the API at /api/docs, made from the schemas below; the spec
  // itself at /api/docs/json.
  .use(
    openapi({
      path: '/docs',
      documentation: {
        info: {
          title: 'Notes API',
          version: '0.0.0',
          description: 'The JSON API of the lit-elysia demo.',
        },
      },
      exclude: {paths: [/\/loads$/]},
    })
  )
  .use(auth)
  .get(
    '/notes',
    {response: t.Array(Note), detail: {summary: 'Every note'}},
    () => allNotes()
  )
  .get(
    '/me',
    {
      auth: true,
      response: {200: t.Object({name: t.String()}), 401: Problem},
      detail: {summary: 'The name the site knows you by'},
    },
    ({visitor}) => ({name: visitor})
  )
  // Server-sent events from a generator: one per note added, for as long as
  // the client listens. Eden reads them back typed, with `for await`.
  .get(
    '/notes/feed',
    {detail: {summary: 'New notes, as server-sent events'}},
    async function* ({request}) {
      yield sse({event: 'ready', data: {count: allNotes().length}});
      for await (const note of notesAdded(request.signal)) {
        yield sse({event: 'note', data: note});
      }
    }
  )
  .get(
    '/notes/:id',
    {
      params: t.Object({id: t.Numeric()}),
      response: {200: Note, 404: Problem},
      detail: {summary: 'One note'},
    },
    ({params: {id}}) =>
      findNote(id) ?? status(404, {message: `There is no note ${id}.`})
  )
  // Which pages' loads ran: the latency wait stops a page the client left.
  .get('/loads', () => loads())
  .delete('/loads', () => {
    clearLoads();
    return null;
  })
  .post(
    '/notes',
    {
      body: t.Object({title: t.String(), body: t.String()}),
      response: {
        200: Note,
        409: t.Object({message: t.String(), existing: t.Number()}),
      },
      detail: {summary: 'Add a note, unless its title is taken'},
    },
    ({body}) => {
      const taken = noteTitled(body.title);
      return taken
        ? status(409, {
            message: `“${taken.title}” is taken.`,
            existing: taken.id,
          })
        : addNote(body);
    }
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
