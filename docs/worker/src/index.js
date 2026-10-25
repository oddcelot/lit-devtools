// Docs pages go through unchanged except for two things GitHub Pages can't
// do. Every page gets RFC 8288 Link headers pointing agents at llms.txt, the
// sitemap and the page's Markdown copy. A request that sends
// `Accept: text/markdown` gets that copy (the index.md
// scripts/page-markdown.mjs writes beside each page) instead of the HTML.

/** Links every page carries. */
const siteLinks = [
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</sitemap-index.xml>; rel="sitemap"; type="application/xml"',
  '<https://github.com/oddcelot/lit-devtools>; rel="code-repository"',
];

function linkHeader(pathname) {
  return [
    `<${pathname}index.md>; rel="alternate"; type="text/markdown"`,
    ...siteLinks,
  ].join(', ');
}

/** Browsers never ask for Markdown, so any mention of it with q > 0 wins. */
function wantsMarkdown(accept) {
  return (accept ?? '').split(',').some((range) => {
    const [type, ...params] = range.trim().split(';');
    if (type.trim().toLowerCase() !== 'text/markdown') return false;
    const q = params.find((p) => p.trim().startsWith('q='));
    return !q || Number(q.trim().slice(2)) > 0;
  });
}

async function markdownFor(url, method) {
  const res = await fetch(new URL('index.md', url));
  if (!res.ok) return undefined;
  const text = await res.text();
  return new Response(method === 'HEAD' ? null : text, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      // A rough count, four characters to a token, so an agent can budget
      // before reading.
      'x-markdown-tokens': String(Math.ceil(text.length / 4)),
      'cache-control': res.headers.get('cache-control') ?? 'max-age=600',
      vary: 'Accept',
      link: linkHeader(url.pathname),
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const isPage =
      url.pathname.endsWith('/') &&
      (request.method === 'GET' || request.method === 'HEAD');
    if (!isPage) return fetch(request);

    if (wantsMarkdown(request.headers.get('accept'))) {
      const markdown = await markdownFor(url, request.method);
      if (markdown) return markdown;
    }

    const res = await fetch(request);
    if (!res.ok || !res.headers.get('content-type')?.startsWith('text/html')) {
      return res;
    }
    const page = new Response(res.body, res);
    page.headers.append('link', linkHeader(url.pathname));
    page.headers.append('vary', 'Accept');
    return page;
  },
};
