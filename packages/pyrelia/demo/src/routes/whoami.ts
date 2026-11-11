import {html} from 'lit';
import {definePage} from '@oddsquad/pyrelia/page';
import {href} from '@oddsquad/pyrelia/routes';
import '../components/who-am-i.ts';

export default definePage('/whoami', {
  title: () => 'Auth macro',
  render: () => html`
    <h1>Auth macro</h1>
    <p>
      <code>src/server.ts</code> defines a macro, <code>auth</code>: a route
      that asks for <code>{auth: true}</code> gets <code>visitor</code>, the
      name from the cookie, as a string, or answers <code>401</code> without
      one. <code>GET /api/me</code> asks for it, and Eden types both answers.
    </p>
    <p>
      Ask once, then <a href=${href('/visitor')}>tell the site your name</a>
      and ask again.
    </p>
    <who-am-i></who-am-i>
  `,
});
