// Written by @oddsquad/lit-elysia from the routes folder. Don't edit.
import type {ServerTypes} from '@oddsquad/lit-elysia/routes';

declare module '@oddsquad/lit-elysia/routes' {
  interface Register {
    routes: {
      '/': ServerTypes<typeof import('./routes/index.server')>;
      '/actions': ServerTypes<typeof import('./routes/actions.server')>;
      '/broken': ServerTypes<typeof import('./routes/broken.server')>;
      '/cached': ServerTypes<typeof import('./routes/cached.server')>;
      '/deferred': ServerTypes<typeof import('./routes/deferred.server')>;
      '/eden': ServerTypes<undefined>;
      '/files/*': ServerTypes<typeof import('./routes/files/[...path].server')>;
      '/latest': ServerTypes<typeof import('./routes/latest.server')>;
      '/live': ServerTypes<undefined>;
      '/nested': ServerTypes<undefined>;
      '/nested/second': ServerTypes<undefined>;
      '/notes/:id': ServerTypes<typeof import('./routes/notes/[id].server')>;
      '/params/:a/:b': ServerTypes<
        typeof import('./routes/params/[a]/[b].server')
      >;
      '/private': ServerTypes<typeof import('./routes/private.server')>;
      '/search': ServerTypes<typeof import('./routes/search.server')>;
      '/visitor': ServerTypes<typeof import('./routes/visitor.server')>;
    };
    layouts: {
      '/': ServerTypes<typeof import('./routes/_layout.server')>;
      '/nested': ServerTypes<typeof import('./routes/nested/_layout.server')>;
      '/notes': ServerTypes<undefined>;
    };
    app: typeof import('./server').default;
    context: typeof import('./server').context;
  }
}
