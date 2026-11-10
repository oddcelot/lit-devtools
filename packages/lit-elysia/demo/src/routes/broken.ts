import {html} from 'lit';
import {definePage} from '@oddsquad/lit-elysia/page';

// Never rendered: its load always throws.
export default definePage({render: () => html``});
