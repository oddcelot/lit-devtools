/**
 * Vite config that serves Vite's HMR socket and the DevTools dock's from the
 * page's own HTTP server, for hosts that give each port an origin of its
 * own, as StackBlitz does. `stackblitz.mjs` uses it.
 *
 * In middleware mode Vite opens its HMR socket on a port of its own, and the
 * DevTools hub (and the Lit panel's devframe), finding `httpServer` null,
 * open a side socket from port 9777. A page served from another port's
 * origin reaches neither.
 */

/**
 * @param {import('node:http').Server} http The server the page comes from.
 * @returns {import('vite').InlineConfig}
 */
export const onePort = (http) => ({
  server: {hmr: {server: http}},
  plugins: [
    {
      name: 'ssr:one-port',
      // Before the hub's and the panel's `configureServer` read it.
      enforce: 'pre',
      configureServer(server) {
        server.httpServer ??= http;
      },
    },
  ],
});
