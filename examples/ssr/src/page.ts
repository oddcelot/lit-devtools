import {html} from 'lit';
import './ssr-counter.js';
import './ssr-deferred.js';

/** The page the server renders, and the client hydrates element by element. */
export const page = () => html`
  <h1>Lit SSR</h1>
  <ssr-counter start="3"></ssr-counter>
  <ssr-deferred defer-hydration></ssr-deferred>
  <button id="wake">Hydrate the deferred one</button>
`;
