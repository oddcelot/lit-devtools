import {html} from 'lit';
import {definePage, type ErrorData} from '@oddsquad/lit-elysia/page';

export default definePage<ErrorData>({
  title: ({status}) => `Error ${status}`,
  render: ({status, message}) => html`
    <h1>Error ${status}</h1>
    <p id="error-message">${message}</p>
    <a href="/">All notes</a>
  `,
});
