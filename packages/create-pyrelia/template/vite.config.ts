import {defineConfig} from 'vite-plus';
import {pyrelia} from '@oddsquad/pyrelia';

export default defineConfig({
  plugins: [
    pyrelia({
      adapter: 'node',
      // A Content-Security-Policy with a fresh nonce on every page:
      // csp: "default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'",
    }),
  ],
});
