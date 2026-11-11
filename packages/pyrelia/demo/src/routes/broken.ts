import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';

// Never rendered: its load always throws.
export default definePage('/broken', {render: () => html``});
