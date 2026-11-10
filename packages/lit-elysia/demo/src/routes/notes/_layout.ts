import {html} from 'lit';
import {defineLayout} from '@oddsquad/lit-elysia/page';

export default defineLayout({
  render: (content) => html`<article class="note">${content}</article>`,
});
