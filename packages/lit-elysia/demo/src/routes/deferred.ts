import {html, type TemplateResult} from 'lit';
import {until} from 'lit/directives/until.js';
import {definePage} from '@oddsquad/lit-elysia/page';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';
import '../components/note-counter.ts';

const time = (date: Date) => date.toISOString().slice(11, 19);

/** A deferred value: a spinner until it settles, then what it says. */
const later = <T>(
  promise: Promise<T>,
  done: (value: T) => TemplateResult,
  waiting: string
) =>
  until(
    promise.then(
      done,
      (error: Error) =>
        html`<wa-callout variant="danger" role="alert"
          >${error.message}</wa-callout
        >`
    ),
    html`<p aria-busy="true" class="wa-cluster wa-gap-xs">
      <wa-spinner></wa-spinner> ${waiting}
    </p>`
  );

export default definePage('/deferred', {
  title: () => 'Deferred data',
  render: ({renderedAt, count, tags, broken}) => html`
    <h1>Deferred data</h1>
    <p>
      Rendered at <time id="rendered-at">${time(renderedAt)}</time>. The rest
      streams into the same response as it settles. The counter works before it
      has.
    </p>
    <wa-card id="count">
      <span slot="header">After 1.2 seconds</span>
      ${later(
        count,
        ({notes, at}) => html`<p>${notes} notes, counted at ${time(at)}</p>`,
        'Counting notes…'
      )}
    </wa-card>
    <wa-card id="tags">
      <span slot="header">After 2 seconds</span>
      ${later(
        tags,
        (list) => html`<ul>
          ${list.map((tag) => html`<li>${tag}</li>`)}
        </ul>`,
        'Fetching tags…'
      )}
    </wa-card>
    <wa-card id="broken">
      <span slot="header">Fails after 0.6 seconds</span>
      ${later(broken, (text) => html`<p>${text}</p>`, 'Loading…')}
    </wa-card>
    <note-counter></note-counter>
  `,
});
