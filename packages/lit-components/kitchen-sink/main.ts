/**
 * The kitchen sink: every lit-* element in its variants, in the dark and
 * light schemes side by side, at the docs' density or the DevTools'.
 *
 * Rendered into the document rather than a shadow root: the scheme classes
 * on each half (`.wa-dark`, `.wa-light`) are matched by document-level
 * selectors in tokens.css and the theme, which don't reach into shadow DOM.
 */
import {html, render} from 'lit';
import {SECTIONS, type Section} from './sections.js';

const GROUPS = ['Actions', 'Feedback', 'Forms', 'Layout', 'DevTools'] as const;
const DENSITY_KEY = 'kitchen-sink:density';

let density =
  localStorage.getItem(DENSITY_KEY) === 'devtools' ? 'devtools' : 'docs';

const setDensity = (next: 'docs' | 'devtools') => {
  density = next;
  localStorage.setItem(DENSITY_KEY, next);
  draw();
};

const section = (s: Section) => html`<section id=${s.tag}>
  <header>
    <h2>${s.tag}</h2>
    <p>${s.summary}</p>
  </header>
  <div class="halves">
    ${(['dark', 'light'] as const).map(
      (scheme) =>
        html`<div class="half wa-${scheme}">
          <div class="scheme">.wa-${scheme}</div>
          ${s.render()}
        </div>`
    )}
  </div>
</section>`;

const draw = () =>
  render(
    html`<div class="shell density-${density}">
      <div class="top">
        <h1>lit-* kitchen sink</h1>
        <span class="meta"
          >@oddsquad/lit-components on Web Awesome, themed by
          @oddsquad/webawesome-theme-lit</span
        >
        <span class="density">
          Density
          ${(['docs', 'devtools'] as const).map(
            (d) =>
              html`<lit-button
                variant="neutral"
                appearance=${density === d ? 'filled' : 'plain'}
                aria-pressed=${density === d ? 'true' : 'false'}
                @click=${() => setDensity(d)}
                >${d === 'docs' ? 'Docs' : 'DevTools'}</lit-button
              >`
          )}
        </span>
      </div>
      <nav>
        ${GROUPS.map((g) => {
          const inGroup = SECTIONS.filter((s) => s.group === g);
          return inGroup.length === 0
            ? null
            : html`<h2>${g}</h2>
                ${inGroup.map((s) => html`<a href="#${s.tag}">${s.tag}</a>`)}`;
        })}
      </nav>
      <main>${SECTIONS.map(section)}</main>
    </div>`,
    document.body
  );

draw();
