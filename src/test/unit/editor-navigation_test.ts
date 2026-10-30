import {describe, expect, test} from 'vite-plus/test';
import type {ComponentDocs} from '../../types/component-docs.js';
import {
  type NavigationSource,
  implementationAt,
  referencesAt,
} from '../../lib/editor/navigation.js';

const base = `import {LitElement} from 'lit';
export class Base extends LitElement {
  /** Inherited. */
  @property({type: Boolean, attribute: 'is-open'}) open = false;
}
`;

const card = `import {Base} from './base.js';
@customElement('x-card')
export class XCard extends Base {
  static properties = {tone: {}};
  static observedAttributes = ['legacy'];
  close() {
    this.dispatchEvent(new Event('closed'));
  }
}
`;

const docs: ComponentDocs = {
  tagName: 'x-card',
  className: 'XCard',
  properties: [
    {name: 'open', counterpart: 'is-open'},
    {name: 'tone', counterpart: 'tone'},
  ],
  attributes: [
    {name: 'is-open', counterpart: 'open'},
    {name: 'tone', counterpart: 'tone'},
    {name: 'legacy'},
  ],
  events: [{name: 'closed'}],
  slots: [],
  cssParts: [],
  cssProperties: [],
  cssStates: [],
  origin: {manifest: '', module: '/p/src/x-card.ts', source: true},
};

const disk: Record<string, string> = {
  '/p/src/base.ts': base,
  '/p/src/x-card.ts': card,
  '/p/index.html': '<x-card is-open></x-card>\n',
  '/p/src/app.tsx':
    'export const A = () => <x-card tone="warm" onclosed={go} />;\n',
  '/p/src/page.astro': '---\n---\n<x-card tone={tone}></x-card>\n',
  '/p/src/doc.mdx': '# Doc\n\n<x-card tone="cold" />\n',
};

const source: NavigationSource = {
  get: async (_, tag) => (tag === 'x-card' ? docs : null),
  declarationsOf: (tag) =>
    tag === 'x-card'
      ? [
          {file: '/p/src/x-card.ts', name: 'XCard'},
          {file: '/p/src/base.ts', name: 'Base'},
        ]
      : [],
  files: async () => Object.keys(disk),
  readText: async (file) => disk[file],
  templateTagsOf: () => undefined,
};

/** A request at `‸` in a script. */
const request = (text: string, file = '/p/src/app.ts') => ({
  file,
  code: text.replace('‸', ''),
  kind: 'script' as const,
  offset: text.indexOf('‸'),
});

/** The text a span covers. */
const textOf = ({
  file,
  start,
  end,
}: {
  file: string;
  start: number;
  end: number;
}) => disk[file].slice(start, end);

describe('implementationAt', () => {
  test("goes to an inherited property from its attribute's other name", async () => {
    const [found] = await implementationAt(
      source,
      request('html`<x-card is-o‸pen>`')
    );
    expect(found.file).toBe('/p/src/base.ts');
    expect(textOf(found)).toBe('open');
  });

  test('goes to a static properties entry and an observed attribute', async () => {
    const [tone] = await implementationAt(
      source,
      request('html`<x-card .to‸ne=${1}>`')
    );
    expect([tone.file, textOf(tone)]).toEqual(['/p/src/x-card.ts', 'tone']);
    const [legacy] = await implementationAt(
      source,
      request('html`<x-card leg‸acy>`')
    );
    expect(textOf(legacy)).toBe('legacy');
  });

  test('goes to the event a class builds, else to the class', async () => {
    const [closed] = await implementationAt(
      source,
      request('html`<x-card @clo‸sed=${f}>`')
    );
    expect(textOf(closed)).toBe('closed');
    const [other] = await implementationAt(
      source,
      request('html`<x-card @oth‸er=${f}>`')
    );
    expect(textOf(other)).toBe('XCard');
  });

  test('has nowhere to go for a component without source', async () => {
    expect(await implementationAt(source, request('html`<x-o‸ther>`'))).toEqual(
      []
    );
  });
});

describe('JSX, Astro and MDX', () => {
  const at = (file: string, text: string) => ({
    file,
    code: text.replace('‸', ''),
    kind: (file.endsWith('.tsx') ? 'jsx' : 'astro') as 'jsx' | 'astro',
    offset: text.indexOf('‸'),
  });

  test("goes from an on<event> to the event, and a prop to its property's declaration", async () => {
    const [closed] = await implementationAt(
      source,
      at('/p/src/b.tsx', 'const b = <x-card onclo‸sed={go} />;')
    );
    expect(textOf(closed)).toBe('closed');
    const [open] = await implementationAt(
      source,
      at('/p/src/b.astro', '<x-card op‸en />')
    );
    expect([open.file, textOf(open)]).toEqual(['/p/src/base.ts', 'open']);
  });

  test("goes to a component an Astro file's script defines, in that file", async () => {
    const embed = `---
const {src} = Astro.props;
---
<live-demo src={src}></live-demo>
<script>
  class LiveDemo extends HTMLElement {
    static observedAttributes = ['src'];
  }
  customElements.define('live-demo', LiveDemo);
</script>
`;
    const file = '/p/src/Embed.astro';
    const inPage: NavigationSource = {
      ...source,
      declarationsOf: (tag) =>
        tag === 'live-demo' ? [{file, name: 'LiveDemo'}] : [],
      readText: async (read) => (read === file ? embed : undefined),
    };
    const [cls] = await implementationAt(
      inPage,
      at('/p/src/b.astro', '<live-d‸emo />')
    );
    expect([cls.file, embed.slice(cls.start, cls.end)]).toEqual([
      file,
      'LiveDemo',
    ]);
    const [src] = await implementationAt(
      inPage,
      at('/p/src/b.astro', '<live-demo s‸rc="x" />')
    );
    expect(embed.slice(src.start, src.end)).toBe('src');
    expect(embed.slice(0, src.start).split('\n')).toHaveLength(7);
  });

  test('finds a prop in TSX, Astro and MDX files alike', async () => {
    const spans = await referencesAt(
      source,
      at('/p/src/b.tsx', 'const b = <x-card to‸ne="x" />;'),
      false
    );
    expect(
      spans
        .filter((span) => span.file !== '/p/src/b.tsx')
        .map((span) => [span.file, textOf(span)])
    ).toEqual([
      ['/p/src/app.tsx', 'tone'],
      ['/p/src/page.astro', 'tone'],
      ['/p/src/doc.mdx', 'tone'],
    ]);
  });
});

describe('referencesAt', () => {
  test('finds opening and closing tags in scripts and HTML, not in holes', async () => {
    const text = 'html`<x-c‸ard></x-card> ${"</x-card>"}`';
    const spans = await referencesAt(source, request(text), false);
    const app = spans.filter((span) => span.file === '/p/src/app.ts');
    expect(app.map(({start}) => start)).toEqual([6, 15]);
    expect(spans.filter((span) => span.file === '/p/index.html')).toHaveLength(
      2
    );
  });

  test('finds a property under its attribute name too, with its declaration', async () => {
    const text = 'html`<x-card .op‸en=${true}></x-card>`';
    const spans = await referencesAt(source, request(text), true);
    expect(spans.map((span) => span.file)).toEqual([
      '/p/src/base.ts',
      '/p/src/app.ts',
      '/p/index.html',
    ]);
    expect(textOf(spans[2])).toBe('is-open');
  });
});
