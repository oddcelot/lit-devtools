import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './search.server.ts';

export default definePage<LoadedData<typeof load>>({
  title: ({q}) => (q ? `Search: ${q}` : 'Search'),
  render: ({q, results}) => html`
    <h1>Query string</h1>
    <p>
      A <code>GET</code> form: the router fetches <code>/search?q=…</code> like
      a link.
    </p>
    <form method="get" role="search">
      <input name="q" type="search" value=${q} aria-label="Search notes" />
      <button>Search</button>
    </form>
    <p id="result-count">${results.length} notes match</p>
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
