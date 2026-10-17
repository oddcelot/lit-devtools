/**
 * Astro renders its pages without Vite's `transformIndexHtml`, and that hook
 * is how the plugin puts its page runtime in the page: the timeline and
 * inspector that feed the panel, the source overlay, the HMR indicator and
 * the component manifest links. Without them HMR still works, since it rides
 * in the transformed modules, but the panel says the page never connected.
 *
 * So in dev the Astro integration runs the plugin's own `transformIndexHtml`
 * hooks for each HTML page Astro sends and splices in the tags they return.
 * Only the tags: the HTML the hooks rewrite is an `index.html` as written,
 * which an Astro page never is. Other plugins' hooks stay out of it, as
 * Astro keeps them out.
 */

import type {IncomingMessage, ServerResponse} from 'node:http';
import type {
  HtmlTagDescriptor,
  IndexHtmlTransformContext,
  Plugin,
  ViteDevServer,
} from 'vite';

type Handler = (
  this: unknown,
  html: string,
  ctx: IndexHtmlTransformContext
) => unknown;
type Order = 'pre' | 'post' | undefined;

const hookOf = (plugin: Plugin): {handler: Handler; order: Order} | null => {
  const hook = plugin.transformIndexHtml as unknown;
  if (typeof hook === 'function') {
    return {handler: hook as Handler, order: undefined};
  }
  if (typeof hook === 'object' && hook !== null) {
    const {handler, order} = hook as {handler?: Handler; order?: Order};
    if (handler) return {handler, order};
  }
  return null;
};

const ORDERS: Order[] = ['pre', undefined, 'post'];

/** The tags the plugins' `transformIndexHtml` hooks return for a page. */
export const collectPageTags = async (
  plugins: readonly Plugin[],
  html: string,
  ctx: IndexHtmlTransformContext
): Promise<HtmlTagDescriptor[]> => {
  const hooks = plugins.flatMap((plugin) => {
    const hook = hookOf(plugin);
    return hook ? [{plugin, ...hook}] : [];
  });
  const tags: HtmlTagDescriptor[] = [];
  for (const order of ORDERS) {
    for (const hook of hooks.filter((h) => h.order === order)) {
      const result = await hook.handler.call(hook.plugin, html, ctx);
      if (Array.isArray(result)) tags.push(...result);
      else if (typeof result === 'object' && result !== null) {
        tags.push(...((result as {tags?: HtmlTagDescriptor[]}).tags ?? []));
      }
    }
  }
  return tags;
};

const escapeAttr = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

const serializeTag = ({tag, attrs, children}: HtmlTagDescriptor): string => {
  const attributes = Object.entries(attrs ?? {})
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([name, value]) =>
      value === true ? ` ${name}` : ` ${name}="${escapeAttr(String(value))}"`
    )
    .join('');
  if (tag === 'link' || tag === 'meta') return `<${tag}${attributes}>`;
  const inner =
    typeof children === 'string'
      ? children
      : (children ?? []).map(serializeTag).join('');
  return `<${tag}${attributes}>${inner}</${tag}>`;
};

/** Splices tags in where their `injectTo` says, as Vite would. */
export const injectPageTags = (
  html: string,
  tags: readonly HtmlTagDescriptor[]
): string => {
  const at = (where: NonNullable<HtmlTagDescriptor['injectTo']>) =>
    tags
      .filter((tag) => (tag.injectTo ?? 'head-prepend') === where)
      .map(serializeTag)
      .join('');
  const splice = (
    source: string,
    pattern: RegExp,
    before: boolean,
    add: string
  ) =>
    add === ''
      ? source
      : source.replace(pattern, (match) =>
          before ? add + match : match + add
        );
  let out = html;
  out = splice(out, /<head[^>]*>/i, false, at('head-prepend'));
  out = splice(out, /<\/head>/i, true, at('head'));
  out = splice(out, /<body[^>]*>/i, false, at('body-prepend'));
  out = splice(out, /<\/body>/i, true, at('body'));
  return out;
};

/**
 * A middleware that holds each HTML response back until it is complete, then
 * sends it with the plugins' tags in. Dev only, where streaming a page
 * matters less than the panel seeing it.
 */
export const pageTagsMiddleware =
  (plugins: readonly Plugin[], server: ViteDevServer) =>
  (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (
      req.method !== 'GET' ||
      !req.headers.accept?.includes('text/html') ||
      // Vite's and the devframes' own pages: the panel at `/__lit/` is HTML
      // too, and must not run the page runtime itself.
      /^\/(@|__)/.test(req.url ?? '')
    ) {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    const write = res.write.bind(res);
    const end = res.end.bind(res);
    const isHtml = () =>
      String(res.getHeader('content-type') ?? '').includes('text/html');
    const toBuffer = (chunk: unknown, encoding?: unknown): Buffer => {
      if (chunk instanceof Uint8Array) return Buffer.from(chunk);
      return Buffer.from(
        String(chunk),
        typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined
      );
    };

    res.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
      if (!isHtml())
        return write(chunk as never, encoding as never, callback as never);
      chunks.push(toBuffer(chunk, encoding));
      if (typeof encoding === 'function') encoding();
      else if (typeof callback === 'function') callback();
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: unknown, encoding?: unknown, callback?: unknown) => {
      if (!isHtml())
        return end(chunk as never, encoding as never, callback as never);
      if (chunk !== undefined && typeof chunk !== 'function') {
        chunks.push(toBuffer(chunk, encoding));
      }
      const html = Buffer.concat(chunks).toString('utf8');
      const url = req.url ?? '/';
      void collectPageTags(plugins, html, {
        path: url,
        filename: url,
        server,
      })
        .then((tags) => injectPageTags(html, tags))
        .catch((error: unknown) => {
          server.config.logger.warn(
            `[lit-plugin] could not add the page runtime to ${url}: ${String(error)}`
          );
          return html;
        })
        .then((out) => {
          if (!res.headersSent) {
            res.removeHeader('content-length');
          }
          end(out);
        });
      return res;
    }) as typeof res.end;

    next();
  };
