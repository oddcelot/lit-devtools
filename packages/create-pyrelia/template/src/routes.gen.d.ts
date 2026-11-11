// Written by @oddsquad/pyrelia from the routes folder. Don't edit.
import type {ServerTypes} from '@oddsquad/pyrelia/routes';

declare module '@oddsquad/pyrelia/routes' {
  interface Register {
    routes: {
      '/': ServerTypes<typeof import('./routes/index.server')>;
      '/about': ServerTypes<undefined>;
    };
    layouts: {
      '/': ServerTypes<typeof import('./routes/_layout.server')>;
    };
    app: typeof import('./server').default;
    context: typeof import('./server').context;
  }
}
