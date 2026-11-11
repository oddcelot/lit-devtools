import {defineConfig} from 'vite-plus';
import {presetWind4} from 'unocss';
import {pyrelia} from '@oddsquad/pyrelia';
import {unoSheet} from '@oddsquad/vite-plugin-lit/uno';

export default defineConfig({
  plugins: [
    // The utilities the components in src/components/uno use, written to a
    // file they import with ?css-sheet: one shared sheet. Before
    // Pyrelia, whose Lit plugin compiles that import.
    unoSheet({
      outFile: 'src/uno.generated.css',
      // These components alone, in dev and in a build alike: by default it
      // also reads every module the dev server transforms, Pyrelia's own
      // source among them, and the committed file would flip between two.
      dir: 'src/components/uno',
      include: /\/src\/components\/uno\/.*\.ts$/,
      // Wind4's utilities read the theme variables in its preflights.
      preflights: true,
      config: {
        // No reset: it would repeat in every shadow root. `dark:` as a
        // media query, which a shadow root sees: a class on <html> isn't
        // an ancestor there. The page follows the system the same way.
        presets: [presetWind4({dark: 'media', preflights: {reset: false}})],
      },
    }),
    pyrelia({
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
