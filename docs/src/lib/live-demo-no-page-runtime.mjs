/**
 * Keeps the site's own Lit DevTools runtime out of the live panel's demo
 * frames on the docs' dev server.
 *
 * `litDevtools()` adds the plugin's page runtime to every HTML page in dev
 * (its middleware in src/lib/astro/page-tags.ts). A demo frame brings its
 * own, the demo runtime (src/panel/figures/live/demo-runtime.ts), bound to
 * the panel beside it; with the site's beside it, two inspectors answered
 * every command, and an edit one of them wrote was missing from the other's
 * details (a #private field vanished from the panel once edited). The built
 * site has no page runtime, so dev now matches it: a demo frame's request
 * drops `text/html` from its Accept header, which is what the runtime's
 * middleware adds its tags for. Astro renders the page all the same.
 *
 * It must come before `litDevtools()` in `integrations`, so its middleware
 * runs first.
 */
const DEMO_FRAME =
  /^\/live-panel\/(?:demo|showcase\/demo|examples\/[\w-]+\/demo)\/(?:[?#]|$)/;

export const liveDemoNoPageRuntime = () => ({
  name: 'live-demo-no-page-runtime',
  hooks: {
    'astro:server:setup': ({server}) => {
      server.middlewares.use((req, _res, next) => {
        if (DEMO_FRAME.test(req.url ?? '') && req.headers.accept) {
          req.headers.accept = req.headers.accept.replace(
            /text\/html,?\s*/g,
            ''
          );
        }
        next();
      });
    },
  },
});
