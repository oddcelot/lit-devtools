// Before anything imports Lit, so pre-rendered elements hydrate instead of
// rendering again.
import '@lit-labs/ssr-client/lit-element-hydrate-support.js';
import './ssr-counter.js';
import './ssr-deferred.js';

document.querySelector('#wake')?.addEventListener('click', () => {
  document.querySelector('ssr-deferred')?.removeAttribute('defer-hydration');
});
