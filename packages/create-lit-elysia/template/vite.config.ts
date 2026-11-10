import {defineConfig} from 'vite-plus';
import {litElysia} from '@oddsquad/lit-elysia';

export default defineConfig({
  plugins: [
    litElysia({
      adapter: 'node',
      // A Content-Security-Policy with a fresh nonce on every page:
      // csp: "default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'",
    }),
  ],
});
