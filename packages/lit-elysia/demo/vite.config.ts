import {defineConfig} from 'vite-plus';
import {litElysia} from '@oddsquad/lit-elysia';

export default defineConfig({
  plugins: [
    litElysia({
      // `vp build` runs on Node; `pnpm build:cloudflare` makes a Worker.
      adapter: process.env['ADAPTER'] === 'cloudflare' ? 'cloudflare' : 'node',
      // No 'unsafe-inline': every inline script and style carries the
      // response's nonce. Enforced in the build, report-only in dev.
      csp: [
        "default-src 'self'",
        "script-src 'self' 'nonce-{nonce}'",
        "style-src 'self' 'nonce-{nonce}'",
        // Web Awesome's templates use style attributes, which no nonce covers.
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data:",
        // Web Awesome loads its built-in icons from data: URLs.
        "connect-src 'self' data: ws: wss:",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
    }),
  ],
});
