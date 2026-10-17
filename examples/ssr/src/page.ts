import {html} from 'lit';
import './ssr-counter.js';
import './ssr-deferred.js';
import './ssr-themed.js';

/** The page the server renders, and the client hydrates element by element. */
export const page = () => html`
  <h1>Lit SSR</h1>
  <ssr-counter start="3"></ssr-counter>
  <ssr-deferred defer-hydration></ssr-deferred>
  <ssr-themed></ssr-themed>
  <button id="wake">Water the plant (hydrate the deferred one)</button>
`;
