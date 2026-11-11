import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';

// Never rendered: its load always redirects.
export default definePage('/latest', {render: () => html``});
