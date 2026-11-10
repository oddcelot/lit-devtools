import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './search.server.ts';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/input/input.js';

export default definePage<LoadedData<typeof load>>({
  title: ({q}) => (q ? `Search: ${q}` : 'Search'),
  render: ({q, results}) => html`
    <h1>Query string</h1>
    <p>
      A <code>GET</code> form: the router fetches <code>/search?q=…</code> like
      a link.
    </p>
    <form method="get" role="search" class="wa-cluster wa-align-items-end">
      <wa-input
        name="q"
        type="search"
        value=${q}
        label="Search notes"
      ></wa-input>
      <wa-button type="submit">Search</wa-button>
    </form>
    <p><wa-badge id="result-count">${results.length} notes match</wa-badge></p>
    <ul>
      ${results.map(
        (note) =>
          html`<li>
            <a href=${href('/notes/:id', {id: note.id})}>${note.title}</a>
          </li>`
      )}
    </ul>
  `,
});
