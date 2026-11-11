import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';

export default definePage('/nested/second', {
  title: () => 'Second tab',
  render: () => html`
    <h1>Second tab</h1>
    <p>
      Only this part changed. The time below shows the layout's load ran again.
    </p>
  `,
});
