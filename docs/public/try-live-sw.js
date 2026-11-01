/**
 * Makes the landing page cross-origin isolated for the hero's "Try it live"
 * (src/components/landing/TryLive.astro). The runbun.dev embed runs a Vite
 * dev server, which needs SharedArrayBuffer, so the page that frames it must
 * be isolated. GitHub Pages cannot send the COOP/COEP headers, so this
 * worker adds them, as start/demos/coi-sw.js does for the StackBlitz embeds.
 *
 * Only a load of the landing page marked `?try` is isolated: the button
 * reloads to it once, and every other visit stays as it was. Its frames (the
 * demos, and the live panel's frame inside its own) need COEP of their own
 * to load in it, so every same-origin frame document gets it. In a page
 * that isn't isolated that only drops credentials from a frame's
 * cross-origin requests, and the site's frames make none. Everything else
 * passes through.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.mode !== 'navigate') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  const landing =
    request.destination === 'document' &&
    url.pathname === scope.pathname &&
    url.searchParams.has('try');
  const frame =
    (request.destination === 'iframe' || request.destination === 'frame') &&
    url.origin === scope.origin;
  if (!landing && !frame) return;
  event.respondWith(
    fetch(request).then((response) => {
      const headers = new Headers(response.headers);
      if (landing) headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    })
  );
});
