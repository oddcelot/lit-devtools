/**
 * The kitchen sink: every lit-* element in its variants, in the dark and
 * light schemes side by side, at the docs' density or the DevTools'.
 *
 * Rendered into the document rather than a shadow root: the scheme classes
 * on each half (`.wa-dark`, `.wa-light`) are matched by document-level
 * selectors in tokens.css and the theme, which don't reach into shadow DOM.
 */
import {html, render} from 'lit';
import {
  loadDocs,
  renderApi,
  renderVariants,
  type Variants,
} from './generated.js';
import {GROUPS, SECTIONS, type Section} from './sections.js';

const DENSITY_KEY = 'kitchen-sink:density';

// The chrome's tokens follow the OS scheme on their own; Web Awesome only
// switches by class, so the top bar, where the chrome's controls are, takes
// `.wa-dark` with it, or they draw light-scheme text on the dark chrome. Not
// `:root`: the specimens' scoped tokens pick the nearest `.wa-dark` /
// `.wa-light` ancestor, and one on the root would match inside the light
// halves too. Asks for light: the tokens are dark when the OS states no
// preference.
const lightScheme = matchMedia('(prefers-color-scheme: light)');
lightScheme.addEventListener('change', () => draw());

let filter = '';

const matches = (s: Section) =>
  filter === '' || s.tag.includes(filter) || s.summary.includes(filter);

let density =
  localStorage.getItem(DENSITY_KEY) === 'devtools' ? 'devtools' : 'docs';

const setDensity = (next: 'docs' | 'devtools') => {
  density = next;
  localStorage.setItem(DENSITY_KEY, next);
  draw();
};

const halves = (
  label: string,
  content: (scheme: 'dark' | 'light') => unknown
) => html`<div class="halves">
  ${(['dark', 'light'] as const).map(
    (scheme) =>
      html`<div class="half wa-${scheme}">
        <div class="scheme">${label} · .wa-${scheme}</div>
        ${content(scheme)}
      </div>`
  )}
</div>`;

const section = (s: Section) => html`<section id=${s.tag}>
  <header>
    <h2>${s.tag}</h2>
    <p>${s.summary}</p>
  </header>
  ${s.render === undefined ? null : halves('uses', s.render)}
  ${
    s.variants === false
      ? null
      : halves('variants', () => renderVariants(s.tag, s.variants as Variants))
  }
  ${renderApi(s.tag)}
</section>`;

const draw = () =>
  render(
    html`<div class="shell density-${density}">
      <div class="top ${lightScheme.matches ? '' : 'wa-dark'}">
        <h1>lit-* kitchen sink</h1>
        <span class="meta"
          >@oddsquad/lit-components on Web Awesome, themed by
          @oddsquad/webawesome-theme-lit</span
        >
        <lit-input
          class="filter"
          placeholder="Filter components"
          with-clear
          .value=${filter}
          @input=${(e: Event) => {
            filter = ((e.target as HTMLInputElement).value ?? '').trim();
            draw();
          }}
          ><lit-icon slot="start" name="magnifying-glass"></lit-icon
        ></lit-input>
        <span class="density">
          <span aria-hidden="true">Density</span>
          <wa-button-group label="Density">
            ${(['docs', 'devtools'] as const).map(
              (d) =>
                html`<lit-button
                  variant="neutral"
                  appearance=${density === d ? 'accent' : 'outlined'}
                  aria-pressed=${density === d ? 'true' : 'false'}
                  @click=${() => setDensity(d)}
                  >${d === 'docs' ? 'Docs' : 'DevTools'}</lit-button
                >`
            )}
          </wa-button-group>
        </span>
      </div>
      <nav>
        ${GROUPS.map((g) => {
          const inGroup = SECTIONS.filter((s) => s.group === g && matches(s));
          return inGroup.length === 0
            ? null
            : html`<h2>${g}</h2>
                ${inGroup.map((s) => html`<a href="#${s.tag}">${s.tag}</a>`)}`;
        })}
      </nav>
      <main>${SECTIONS.filter(matches).map(section)}</main>
    </div>`,
    document.body
  );

await loadDocs();
draw();
