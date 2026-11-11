import {html} from 'lit';
import {definePage, type ErrorData} from '@oddsquad/pyrelia/page';

export default definePage<ErrorData>({
  title: ({status}) => `Error ${status}`,
  render: ({status, message}) => html`<h1>Error ${status}</h1>
    <p>${message}</p>`,
});
