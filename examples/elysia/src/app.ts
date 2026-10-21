import {Elysia, t} from 'elysia';
import type {Entries} from './entries.ts';
import {renderDocument} from './render.ts';
import {LIMITS, type LiveMessage} from './shared.ts';

/** Where the client bundle comes from: built in memory, or from `dist/`. */
export interface Assets {
  /** URL of the client entry, for the page's `<script type="module">`. */
  script: string;
  /** A response for `/assets/<path>`, or nothing for a 404. */
  serve(path: string): Response | undefined | Promise<Response | undefined>;
}

export interface AppOptions {
  entries: Entries;
  assets: Assets;
  /** URL of a standalone `lit-devtools.js` to load before the app. */
  devtools?: string;
  /** Inline script for the page's `<head>`; the dev server's live reload. */
  reload?: string;
}

const Entry = t.Object({
  id: t.Number(),
  name: t.String(),
  message: t.String(),
  createdAt: t.String(),
});

// `\S` so a name of only spaces is as empty as no name.
const EntryInput = t.Object({
  name: t.String({pattern: '\\S', maxLength: LIMITS.name}),
  message: t.String({pattern: '\\S', maxLength: LIMITS.message}),
});

const LIVE = 'live';

export const createApp = ({entries, assets, devtools, reload}: AppOptions) => {
  let online = 0;
  const publish = (message: LiveMessage) =>
    app.server?.publish(LIVE, JSON.stringify(message));

  const sign = (input: {name: string; message: string}) => {
    const entry = entries.add(input);
    publish({type: 'entry', entry});
    return entry;
  };

  const app = new Elysia()
    .get('/', ({query}) => {
      const body = renderDocument({
        data: {
          entries: entries.list(),
          online,
          error:
            query.error === 'invalid'
              ? 'Both a name and a message, please.'
              : undefined,
        },
        script: assets.script,
        devtools,
        reload,
      });
      return new Response(body, {
        headers: {'content-type': 'text/html; charset=utf-8'},
      });
    })
    .get('/assets/*', async ({params, status}) => {
      return (await assets.serve(params['*'])) ?? status(404, 'Not found');
    })
    .get('/api/entries', () => entries.list(), {response: t.Array(Entry)})
    .post('/api/entries', ({body}) => sign(body), {
      body: EntryInput,
      response: Entry,
    })
    // The form's own action: what a post does before the page hydrates, or
    // with JavaScript off. A plain redirect back, so a reload does not post
    // again.
    .post(
      '/sign',
      ({body, redirect}) => {
        sign(body);
        return redirect('/', 303);
      },
      {
        body: EntryInput,
        error: ({code, redirect}) => {
          if (code === 'VALIDATION') return redirect('/?error=invalid', 303);
        },
      }
    )
    // Messages go out through `publish`, which Elysia does not validate, so
    // there is no response schema here; the page reads them as LiveMessage.
    .ws('/live', {
      open(ws) {
        ws.subscribe(LIVE);
        publish({type: 'online', count: ++online});
      },
      close(ws) {
        ws.unsubscribe(LIVE);
        publish({type: 'online', count: --online});
      },
    });

  return app;
};

export type App = ReturnType<typeof createApp>;
