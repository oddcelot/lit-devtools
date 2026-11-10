import {html, type TemplateResult} from 'lit';
import {until} from 'lit/directives/until.js';
import {definePage, type LoadedData} from '@oddsquad/lit-elysia/page';
import type {load} from './deferred.server.ts';
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
      (error: Error) => html`<p role="alert">${error.message}</p>`
    ),
    html`<p aria-busy="true">${waiting}</p>`
  );

export default definePage<LoadedData<typeof load>>({
  title: () => 'Deferred data',
  render: ({renderedAt, count, tags, broken}) => html`
    <h1>Deferred data</h1>
    <p>
      Rendered at <time id="rendered-at">${time(renderedAt)}</time>. The rest
      streams into the same response as it settles. The counter works before it
      has.
    </p>
    <article id="count">
      <header>After 1.2 seconds</header>
      ${later(
        count,
        ({notes, at}) => html`<p>${notes} notes, counted at ${time(at)}</p>`,
        'Counting notes…'
      )}
    </article>
    <article id="tags">
      <header>After 2 seconds</header>
      ${later(
        tags,
        (list) =>
          html`<ul>
            ${list.map((tag) => html`<li>${tag}</li>`)}
          </ul>`,
        'Fetching tags…'
      )}
    </article>
    <article id="broken">
      <header>Fails after 0.6 seconds</header>
      ${later(broken, (text) => html`<p>${text}</p>`, 'Loading…')}
    </article>
    <note-counter></note-counter>
  `,
});
