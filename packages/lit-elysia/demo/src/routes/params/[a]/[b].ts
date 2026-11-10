import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './[b].server.ts';

export default definePage<LoadedData<typeof load>>({
  title: ({a, b}) => `Params: ${a}, ${b}`,
  render: ({a, b}) => html`
    <h1>Two params</h1>
    <p>
      <code>routes/params/[a]/[b].ts</code> answers <code>/params/:a/:b</code>.
    </p>
    <dl>
      <dt>a</dt>
      <dd id="param-a">${a}</dd>
      <dt>b</dt>
      <dd id="param-b">${b}</dd>
    </dl>
    <p>
      <a href="/params/blue/square">blue, square</a> ·
      <a href="/params/${b}/${a}">swap them</a>
    </p>
  `,
});
