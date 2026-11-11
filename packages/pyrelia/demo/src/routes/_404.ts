import {html} from 'lit';
import {definePage, type ErrorData} from '@oddsquad/pyrelia/page';
import '@awesome.me/webawesome/dist/components/callout/callout.js';

export default definePage<ErrorData>({
  title: () => 'Not found',
  render: ({message}) => html`
    <h1>Not found</h1>
    <wa-callout variant="danger"
      ><span id="error-message">${message}</span></wa-callout
    >
    <a href="/">All notes</a>
  `,
});
