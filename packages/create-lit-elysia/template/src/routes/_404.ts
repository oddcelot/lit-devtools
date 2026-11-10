import {html} from 'lit';
import {definePage, type ErrorData} from '@oddsquad/lit-elysia/page';

export default definePage<ErrorData>({
  title: () => 'Not found',
  render: ({message}) => html`<h1>Not found</h1>
    <p>${message}</p>`,
});
