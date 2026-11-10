// Written by @oddsquad/lit-elysia from the routes folder. Don't edit.
declare module '@oddsquad/lit-elysia/routes' {
  interface Register {
    routes: '/' | '/about';
    app: typeof import('./server').default;
    context: typeof import('./server').context;
  }
}

export {};
