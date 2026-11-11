import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';

export default definePage('/private', {
  title: () => 'Private',
  render: ({visitor}) => html`
    <h1>Private</h1>
    <p id="private-greeting">Only for people with a name, like ${visitor}.</p>
  `,
});
