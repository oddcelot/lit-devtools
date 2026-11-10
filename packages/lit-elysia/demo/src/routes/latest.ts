import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';

// Never rendered: its load always redirects.
export default definePage('/latest', {render: () => html``});
