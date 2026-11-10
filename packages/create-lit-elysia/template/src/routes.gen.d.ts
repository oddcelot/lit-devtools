// Written by @oddsquad/lit-elysia from the routes folder. Don't edit.
import type {ServerTypes} from '@oddsquad/lit-elysia/routes';

declare module '@oddsquad/lit-elysia/routes' {
  interface Register {
    routes: {
      '/': ServerTypes<typeof import('./routes/index.server')>;
      '/about': {data: undefined; form: undefined};
    };
    layouts: {
      '/': ServerTypes<typeof import('./routes/_layout.server')>;
    };
    app: typeof import('./server').default;
    context: typeof import('./server').context;
  }
}
