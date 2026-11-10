import {defineConfig} from 'vite-plus';
import {litElysia} from '@oddsquad/lit-elysia';

export default defineConfig({
  plugins: [
    litElysia({
      // No 'unsafe-inline': every inline script and style carries the
      // response's nonce. Enforced in the build, report-only in dev.
      csp: [
        "default-src 'self'",
        "script-src 'self' 'nonce-{nonce}'",
        "style-src 'self' 'nonce-{nonce}'",
        "img-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
    }),
  ],
});
