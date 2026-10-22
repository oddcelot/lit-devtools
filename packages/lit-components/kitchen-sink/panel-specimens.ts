/**
 * The panel's smaller views, each on its own over the recording the figures
 * share (src/panel/figures/recording.ts), for the kitchen sink. They render
 * under `.panel-specimen`, which gets the panel's tokens and Web Awesome
 * density instead of the page's.
 */
import {html} from 'lit';
import '../../../src/panel/figures/no-host.js';
import {injectTokens} from '../../../src/lib/token-text.js';
import {summarizeRange} from '../../../src/lib/timeline/range.js';
import {layers, spans} from '../../../src/panel/figures/recording.js';
import '../../../src/panel/wa-icons.js';
import '../../../src/panel/timeline-layers.js';
import '../../../src/panel/timeline-span-detail.js';
import '../../../src/panel/timeline-range-summary.js';

injectTokens({scope: '.panel-specimen', webAwesome: true});

const specimen = (content: unknown) =>
  html`<div class="panel-specimen">${content}</div>`;

/** The recording's first `update` phase that changed properties. */
const update = spans.find(
  (s) => s.name === 'update' && (s.changed?.length ?? 0) > 0
)!;

/** A range over the middle third of the recording. */
const middle = (() => {
  const start = Math.min(...spans.map((s) => s.start));
  const end = Math.max(...spans.map((s) => s.end ?? s.start));
  const third = (end - start) / 3;
  return {start: start + third, end: end - third};
})();

export const layerChips = () =>
  specimen(html`<timeline-layers .layers=${layers}></timeline-layers>`);

export const layerChipsCompact = () =>
  specimen(
    html`<timeline-layers
      compact
      caption="Show as tracks"
      .layers=${layers.filter((l) => l.enabled)}
    ></timeline-layers>`
  );

export const spanDetail = () =>
  specimen(
    html`<timeline-span-detail
      filterable
      .inspectable=${false}
      .span=${update}
      .layers=${layers}
    ></timeline-span-detail>`
  );

export const rangeSummary = () =>
  specimen(
    html`<timeline-range-summary
      .summary=${summarizeRange(spans, middle)}
      .layers=${layers}
      .inspectable=${false}
    ></timeline-range-summary>`
  );
