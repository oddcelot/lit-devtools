/**
 * The landing page's HMR demo: one component, an editor showing its source,
 * and the component running twice, once as a page without the plugin and
 * once with it. An edit in the editor reaches both:
 *
 * - With the plugin, it goes through the plugin's own patcher
 *   (src/lib/runtime/patch.ts). The demo defines a new class under the same
 *   tag, as Vite does when it re-runs an edited module; the patcher catches
 *   the second define and patches the class the page already registered,
 *   so the element on screen keeps its count and its half-typed draft.
 * - Without it, Vite reloads the page, and every element starts over. The
 *   demo stands in for that reload by blanking the pane and putting a
 *   fresh element in, at its defaults.
 *
 * Both start from the same state, as if someone had been using the page:
 * clicked a few times, typed a few words. Until the visitor touches the
 * demo it makes the edits itself, one every few seconds.
 */
import {LitElement, css, html, nothing, unsafeCSS} from 'lit';
import {install} from '../../../../src/lib/runtime/patch.js';
import {followTheme} from './theme.js';

followTheme();
// 'warn': an incompatible edit must not reload the frame. None of the
// demo's edits are incompatible, but a reload would wipe the comparison.
install({onIncompatible: 'warn'});

interface Source {
  title: string;
  accent: (typeof ACCENTS)[number];
  note: boolean;
}

const ACCENTS = ['blue', 'cyan', 'violet'] as const;
/** Each accent and the text colour that reads on it. */
const ACCENT_VALUE: Record<Source['accent'], [string, string]> = {
  blue: ['var(--lit-blue-bright)', 'var(--on-accent)'],
  cyan: ['var(--lit-cyan)', 'var(--ink-0)'],
  violet: ['hsl(268 90% 66%)', 'var(--on-accent)'],
};
const TITLES = ['Hello', 'Hello, HMR', 'Still here'];

type Edit = 'title' | 'accent' | 'note';

const next = (src: Source, edit: Edit): Source => {
  switch (edit) {
    case 'title':
      return {
        ...src,
        title: TITLES[(TITLES.indexOf(src.title) + 1) % TITLES.length],
      };
    case 'accent':
      return {
        ...src,
        accent: ACCENTS[(ACCENTS.indexOf(src.accent) + 1) % ACCENTS.length],
      };
    case 'note':
      return {...src, note: !src.note};
  }
};

/**
 * The component as the editor shows it, at one version of its source. Each
 * call makes a new class, the way re-running the module would.
 */
const counterClass = (src: Source) =>
  class DemoCounter extends LitElement {
    static properties = {
      count: {state: true},
      draft: {state: true},
    };

    static styles = css`
      :host {
        --accent: ${unsafeCSS(ACCENT_VALUE[src.accent][0])};
        --on-color: ${unsafeCSS(ACCENT_VALUE[src.accent][1])};
        display: grid;
        gap: 0.6rem;
        /* Room for the line "Add a line" adds (one line and a gap), held
           while it's absent, so adding it moves nothing below. */
        padding-bottom: ${unsafeCSS(src.note ? '0' : 'calc(1.4em + 0.6rem)')};
        font: 0.95rem/1.4 var(--font-sans);
        color: var(--text);
      }
      h2 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--text-strong);
      }
      button {
        justify-self: start;
        font: inherit;
        font-weight: 600;
        padding: 0.35rem 0.8rem;
        border: 0;
        border-radius: var(--radius-sm);
        background: var(--accent);
        color: var(--on-color);
        cursor: pointer;
        transition: background var(--dur-normal) var(--ease-standard);
      }
      input {
        font: inherit;
        padding: 0.35rem 0.55rem;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-sm);
        background: var(--surface-low);
        color: var(--text);
        min-width: 0;
      }
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }
      p {
        margin: 0;
        color: var(--accent);
        font-weight: 600;
      }
    `;

    declare count: number;
    declare draft: string;

    constructor() {
      super();
      this.count = 0;
      this.draft = '';
    }

    render() {
      return html`
        <h2>Counter: ${src.title}</h2>
        <button @click=${() => this.count++}>Count: ${this.count}</button>
        ${src.note ? html`<p>New line, same state.</p>` : nothing}
        <input
          aria-label="Draft"
          placeholder="Type something"
          .value=${this.draft}
          @input=${(e: Event) =>
            (this.draft = (e.target as HTMLInputElement).value)}
        />
      `;
    }
  };

type Counter = InstanceType<ReturnType<typeof counterClass>>;

/** The source text the editor shows, one entry per line. */
const sourceLines = (src: Source): string[] => [
  `@customElement('demo-counter')`,
  `class DemoCounter extends LitElement {`,
  `  static styles = css\`:host { --accent: ${src.accent}; }\`;`,
  `  @state() count = 0;`,
  `  @state() draft = '';`,
  ``,
  `  render() {`,
  `    return html\``,
  `      <h2>Counter: ${src.title}</h2>`,
  `      <button @click=\${this.inc}>Count: \${this.count}</button>`,
  ...(src.note ? [`      <p>New line, same state.</p>`] : []),
  `      <input .value=\${this.draft} @input=\${this.type}>\`;`,
  `  }`,
  `}`,
];

const KEYWORDS =
  /\b(class|extends|static|return|render|this)\b|(@\w+)|('[^']*')|(`)/g;

const highlight = (line: string): string =>
  line
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(KEYWORDS, (m, kw, deco, str) =>
      kw
        ? `<span class="kw">${m}</span>`
        : deco
          ? `<span class="deco">${m}</span>`
          : str
            ? `<span class="str">${m}</span>`
            : `<span class="tick">${m}</span>`
    );

const $ = <T extends Element>(selector: string): T =>
  document.querySelector<T>(selector)!;

const code = $<HTMLElement>('#code');
const hotPane = $<HTMLElement>('#hot');
const coldPane = $<HTMLElement>('#cold');
const hotStatus = $<HTMLElement>('#hot-status');
const coldStatus = $<HTMLElement>('#cold-status');

const INITIAL: Source = {title: 'Hello', accent: 'blue', note: false};
const SEED = {count: 3, draft: 'half-typed draft'};

let source = INITIAL;
let coldVersion = 0;
let busy = false;

const renderCode = (changed: Set<number>) => {
  code.innerHTML = sourceLines(source)
    .map(
      (line, i) =>
        `<span class="line${changed.has(i) ? ' changed' : ''}"><span class="ln">${i + 1}</span>${highlight(line) || ' '}</span>`
    )
    .join('');
};

const seed = (el: Counter) => {
  el.count = SEED.count;
  el.draft = SEED.draft;
};

/** A fresh element in the reload pane, under a tag of its own per version. */
const mountCold = (seeded: boolean): Counter => {
  const tag = `reload-counter-${coldVersion++}`;
  customElements.define(tag, counterClass(source));
  const el = document.createElement(tag) as Counter;
  if (seeded) seed(el);
  coldPane.replaceChildren(el);
  return el;
};

const setStatus = (el: HTMLElement, text: string, tone: string) => {
  el.textContent = text;
  el.dataset.tone = tone;
};

const restart = () => {
  source = INITIAL;
  renderCode(new Set());
  const hot = hotPane.firstElementChild as Counter | null;
  if (hot) {
    // Back to the first version of the class, through the patcher too.
    customElements.define('demo-counter', counterClass(source));
    seed(hot);
  } else {
    customElements.define('demo-counter', counterClass(source));
    const el = document.createElement('demo-counter') as Counter;
    seed(el);
    hotPane.replaceChildren(el);
  }
  mountCold(true);
  const idle = 'Count 3, a draft typed · waiting for an edit';
  setStatus(hotStatus, idle, 'idle');
  setStatus(coldStatus, idle, 'idle');
};

const flash = (el: HTMLElement) => {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
};

const edit = async (kind: Edit) => {
  if (busy) return;
  busy = true;
  const before = sourceLines(source);
  source = next(source, kind);
  const after = sourceLines(source);
  renderCode(
    new Set(after.flatMap((line, i) => (before[i] === line ? [] : [i])))
  );

  // With the plugin: a second define, which the patcher turns into a patch.
  const hot = hotPane.firstElementChild as Counter;
  const started = performance.now();
  customElements.define('demo-counter', counterClass(source));
  await hot.updateComplete;
  const ms = performance.now() - started;
  flash(hotPane);
  setStatus(
    hotStatus,
    `Patched in ${ms < 1 ? '<1' : ms.toFixed(1)} ms · count ${hot.count}, draft kept`,
    'ok'
  );

  // Without it: the page reloads.
  coldPane.classList.add('reloading');
  setStatus(coldStatus, 'Reloading the page…', 'busy');
  await new Promise((r) => setTimeout(r, 650));
  const cold = mountCold(false);
  coldPane.classList.remove('reloading');
  await cold.updateComplete;
  setStatus(coldStatus, 'Reloaded · count 0, draft gone', 'warn');
  busy = false;
};

for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-edit]'
)) {
  button.addEventListener('click', () => {
    stopAutoplay();
    void edit(button.dataset.edit as Edit);
  });
}
$('#restart').addEventListener('click', () => {
  stopAutoplay();
  if (!busy) restart();
});

// Edits on their own until the visitor does anything in the frame.
const AUTOPLAY: Edit[] = ['title', 'accent', 'note', 'title', 'accent'];
let timer: ReturnType<typeof setTimeout> | undefined;
const stopAutoplay = () => {
  clearTimeout(timer);
  timer = undefined;
  document.documentElement.classList.remove('autoplay');
};
const autoplay = (step: number) => {
  if (step >= AUTOPLAY.length) return stopAutoplay();
  timer = setTimeout(
    () => {
      const kind = AUTOPLAY[step];
      const button = document.querySelector(`[data-edit="${kind}"]`);
      button?.classList.add('pressed');
      setTimeout(() => button?.classList.remove('pressed'), 300);
      void edit(kind).then(() => autoplay(step + 1));
    },
    step === 0 ? 2200 : 3600
  );
};
for (const type of ['pointerdown', 'keydown']) {
  addEventListener(type, stopAutoplay, {capture: true, once: true});
}

restart();
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('autoplay');
  autoplay(0);
}

declare global {
  interface HTMLElementTagNameMap {
    // Defined again with each version of the class the demo shows.
    'demo-counter': Counter;
  }
}
