import {defineConfig} from 'vite-plus';
import {presetWind4} from 'unocss';
import {litElysia} from '@oddsquad/lit-elysia';
import {unoSheet} from '@oddsquad/vite-plugin-lit/uno';

export default defineConfig({
  plugins: [
    // The utilities the components in src/components/uno use, written to a
    // file they import with ?css-sheet: one shared sheet. Before
    // litElysia, whose Lit plugin compiles that import.
    unoSheet({
      outFile: 'src/uno.generated.css',
      // Wind4's utilities read the theme variables in its preflights.
      preflights: true,
      config: {
        // No reset: it would repeat in every shadow root.
        presets: [presetWind4({preflights: {reset: false}})],
        content: {pipeline: {include: [/src\/components\/uno\/.*\.ts($|\?)/]}},
      },
    }),
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
