import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';

export default definePage('/nested', {
  render: () => html`
    <h1>First tab</h1>
    <p>
      Click the counter below, then switch tabs: it belongs to the section's
      layout, so it keeps counting. Leave the section and it starts over.
    </p>
  `,
});
