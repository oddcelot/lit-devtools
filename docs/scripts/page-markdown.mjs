// After `astro build`, writes an index.md beside every docs page's
// index.html: the page's title, description and rendered content, turned
// back into Markdown. The Cloudflare Worker in docs/worker/ answers a request
// with `Accept: text/markdown` from these, and each page links its copy as
// rel="alternate". Converting the rendered HTML rather than the MDX source
// means components (asides, tabs, link cards) arrive as their content, not as
// JSX. The clean-ups mirror the ones starlight-llms-txt applies for llms.txt.
// Run via `pnpm run build` in docs/.
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {matches, select, selectAll} from 'hast-util-select';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import {unified} from 'unified';
import {remove} from 'unist-util-remove';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');

/** Elements that are page chrome, not content. */
const chrome = [
  'script',
  'style',
  'svg',
  '.sl-anchor-link',
  '.sr-only',
  'video-player',
];

/** Expressive Code frames: keep the language, drop the frame's labels. */
function codeBlocks() {
  return (tree) => {
    for (const instance of selectAll('.expressive-code', tree)) {
      const pre = select('pre', instance);
      const code = select('code', instance);
      if (pre?.properties.dataLanguage && code) {
        code.properties.className = [`language-${pre.properties.dataLanguage}`];
      }
      // Each line is a div; without newlines between them the block would
      // collapse onto one line.
      if (code) {
        code.children = selectAll('.ec-line', code).flatMap((line, i) => [
          ...(i ? [{type: 'text', value: '\n'}] : []),
          {type: 'text', value: textOf(line).replace(/\n$/, '')},
        ]);
      }
      instance.children = pre ? [pre] : [];
    }
  };
}

/** Starlight tabs become a list: the tab label, then its panel. */
function tabs() {
  return (tree) => {
    for (const instance of selectAll('starlight-tabs', tree)) {
      const labels = selectAll('[role="tab"]', instance);
      const panels = selectAll('[role="tabpanel"]', instance);
      instance.tagName = 'ul';
      instance.properties = {};
      instance.children = panels.map((panel, i) => ({
        type: 'element',
        tagName: 'li',
        properties: {},
        children: [
          {
            type: 'element',
            tagName: 'p',
            properties: {},
            children: [{type: 'text', value: textOf(labels[i]).trim()}],
          },
          panel,
        ],
      }));
    }
  };
}

function stripChrome() {
  return (tree) => {
    remove(
      tree,
      (node) =>
        node.type === 'comment' ||
        chrome.some((selector) => matches(selector, node))
    );
  };
}

function textOf(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

const toMarkdown = unified()
  .use(stripChrome)
  .use(codeBlocks)
  .use(tabs)
  .use(rehypeRemark)
  .use(remarkGfm)
  .use(remarkStringify);

async function* pages(dir) {
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'pagefind' && entry.name !== '_astro') {
        yield* pages(path);
      }
    } else if (entry.name === 'index.html') {
      yield path;
    }
  }
}

const parseHtml = unified().use(rehypeParse);
let count = 0;

for await (const page of pages(dist)) {
  const tree = parseHtml.parse(await readFile(page, 'utf8'));
  const content = select('.sl-markdown-content', tree);
  // Redirect pages and the 404 have no content to offer.
  if (!content) continue;
  const title = textOf(select('h1#_top', tree)).trim();
  const description =
    select('meta[name="description"]', tree)?.properties.content ?? '';
  const mdast = await toMarkdown.run({type: 'root', children: [content]});
  const body = toMarkdown.stringify(mdast).trim();
  const markdown = [`# ${title}`, description && `> ${description}`, body]
    .filter(Boolean)
    .join('\n\n');
  await writeFile(join(dirname(page), 'index.md'), `${markdown}\n`);
  count++;
}

console.log(
  `[page-markdown] wrote index.md for ${count} pages under ${relative(process.cwd(), dist) || '.'}`
);
