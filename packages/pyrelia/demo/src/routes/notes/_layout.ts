import {html} from 'lit';
import {defineLayout} from '@oddsquad/pyrelia/page';
import '@awesome.me/webawesome/dist/components/card/card.js';

/** Each note in a card: the page fills its header, body and footer slots. */
export default defineLayout('/notes', {
  render: (content) => html`<wa-card class="note">${content}</wa-card>`,
});
