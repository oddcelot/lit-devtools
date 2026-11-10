import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import {href} from '@oddsquad/lit-elysia/routes';
import type {load} from './[b].server.ts';
import '@awesome.me/webawesome/dist/components/tag/tag.js';

export default definePage<LoadedData<typeof load>>({
  title: ({a, b}) => `Params: ${a}, ${b}`,
  render: ({a, b}) => html`
    <h1>Two params</h1>
    <p>
      <code>routes/params/[a]/[b].ts</code> answers <code>/params/:a/:b</code>.
    </p>
    <p class="wa-cluster">
      a <wa-tag id="param-a" variant="brand">${a}</wa-tag> b
      <wa-tag id="param-b" variant="success">${b}</wa-tag>
    </p>
    <p>
      <a href=${href('/params/:a/:b', {a: 'blue', b: 'square'})}
        >blue, square</a
      >
      ·
      <a href=${href('/params/:a/:b', {a: b, b: a})}>swap them</a>
    </p>
  `,
});
