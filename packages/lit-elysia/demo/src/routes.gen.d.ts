// Written by @oddsquad/lit-elysia from the routes folder. Don't edit.
declare module '@oddsquad/lit-elysia/routes' {
  interface Register {
    routes:
      | '/'
      | '/actions'
      | '/broken'
      | '/cached'
      | '/deferred'
      | '/files/*'
      | '/latest'
      | '/nested'
      | '/nested/second'
      | '/notes/:id'
      | '/params/:a/:b'
      | '/private'
      | '/search'
      | '/visitor';
    app: typeof import('./server').default;
    context: typeof import('./server').context;
  }
}

export {};
