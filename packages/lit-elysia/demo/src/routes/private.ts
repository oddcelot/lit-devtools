import {html} from 'lit';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './private.server.ts';

export default definePage<LoadedData<typeof load>>({
  title: () => 'Private',
  render: ({visitor}) => html`
    <h1>Private</h1>
    <p id="private-greeting">Only for people with a name, like ${visitor}.</p>
  `,
});
