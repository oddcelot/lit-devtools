import {html} from 'lit';
import {definePage, type ErrorData} from '@oddsquad/lit-elysia/page';
import '@awesome.me/webawesome/dist/components/callout/callout.js';

export default definePage<ErrorData>({
  title: ({status}) => `Error ${status}`,
  render: ({status, message}) => html`
    <h1>Error ${status}</h1>
    <wa-callout variant="danger"
      ><span id="error-message">${message}</span></wa-callout
    >
    <a href="/">All notes</a>
  `,
});
