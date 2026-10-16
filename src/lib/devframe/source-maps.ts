/**
 * Where a component is defined, on a page the plugin never built: the stack
 * of its `customElements.define` call (`runtime/define-sites.ts`) mapped
 * through the page's own sourcemaps.
 *
 * Runs wherever the host is: the extension's panel page, which may fetch from
 * the sites the user enabled, or the `lit-devtools dev` server, which has the
 * page fetch for it (`page-fetch.ts`). The host supplies `fetch`. Per
 * generated script it fetches the script once, finds its map
 * (the `SourceMap` header, else the last `sourceMappingURL` comment; inline
 * `data:` maps too) and keeps the parsed map until {@link reset}.
 *
 * Which frame names the component: the define call's stack starts in
 * library code (`@customElement`, a registration helper) before reaching the
 * module that declares the class. So the first mapped frame outside
 * `node_modules` wins; failing that, the first outside Lit's own packages (a
 * component library's element); failing that, the first mapped frame.
 *
 * Outside `node_modules`, a frame that lands exactly on a mapping segment
 * goes first. Bundlers emit helpers such as `__decorate` with no mappings of
 * their own, and a lookup inside one falls back to the last segment before
 * it: the end of whatever module was bundled ahead of it. Real call sites
 * sit on a segment of their own, so in a token-level map the helper's frame
 * is passed over for the class's module; in a coarser map, where nothing is
 * exact, the order above stands.
 *
 * Anything going wrong (no map, a network error, a map that does not parse)
 * leaves the location unknown; nothing here throws.
 */

import {
  FlattenMap,
  isIgnored,
  originalPositionFor,
  traceSegment,
  type TraceMap,
} from '@jridgewell/trace-mapping';
import type {
  ElementSource,
  GeneratedFrame,
  TemplateSite,
} from '../../types/inspector.js';
import {findTemplate, lineColumnOf, tagOffset} from './template-text.js';

export interface SourceMapResolver {
  /** The original location of the first fitting frame, if any maps. */
  resolve(
    frames: readonly GeneratedFrame[]
  ): Promise<ElementSource | undefined>;
  /**
   * Where the element a {@link TemplateSite} names is written: its `<tag`
   * in the template literal, found by text in the sources the site's
   * scripts map to (the project's own first), else in a script itself.
   */
  locate(site: TemplateSite): Promise<ElementSource | undefined>;
  /** Forget fetched scripts and maps (the page navigated). */
  reset(): void;
}

/** What a fetched response must offer; the page's `fetch` and ours both do. */
export interface FetchedResponse {
  ok: boolean;
  headers: {get(name: string): string | null};
  text(): Promise<string>;
}

export interface SourceMapResolverOptions {
  fetch: (url: string) => Promise<FetchedResponse>;
  /**
   * Whether a script or map URL may be fetched; the panel allows only the
   * inspected site, so a CDN's script or a map hosted elsewhere stays
   * unresolved. Everything when omitted.
   */
  allows?: (url: string) => boolean;
}

const SOURCE_MAPPING_RE = /\/\/[#@]\s*sourceMappingURL=\s*(\S+)\s*$/gm;

/** The last `sourceMappingURL` comment's value in `code`. */
export const sourceMappingUrlOf = (code: string): string | undefined => {
  let last: string | undefined;
  for (const match of code.matchAll(SOURCE_MAPPING_RE)) last = match[1];
  return last;
};

/** The JSON text of a `data:` URL, base64 or percent-encoded. */
export const decodeDataUrl = (url: string): string => {
  const comma = url.indexOf(',');
  if (comma < 0) throw new Error('malformed data: URL');
  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  if (/;base64$/i.test(meta)) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(payload);
};

/**
 * A readable path for a resolved source URL: `webpack://app/./src/a.ts` and
 * `http://host/src/a.ts` both read `src/a.ts`; a `file:` URL keeps its
 * absolute path.
 */
export const displayPath = (source: string): string => {
  let path = source;
  if (/^file:\/\//i.test(path)) {
    path = path.replace(/^file:\/\/[^/]*/i, '');
  } else {
    path = path
      .replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '')
      .replace(/[?#].*$/, '')
      .replace(/^(?:\.?\/)+/, '');
  }
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const NODE_MODULES_RE = /(?:^|\/)node_modules\//;
const LIT_PACKAGE_RE =
  /(?:^|\/)node_modules\/(?:lit|lit-element|lit-html|@lit|@lit-labs)\//;

/** A fetched script: its text, and its parsed map when it has one. */
interface LoadedScript {
  code?: string;
  map?: TraceMap;
}

interface Mapped {
  frame: GeneratedFrame;
  source: string;
  line: number;
  /** 0-based, as the map has it. */
  column: number;
  ignored: boolean;
  /** The frame sits on a segment's start, not somewhere after one. */
  exact: boolean;
}

export const createSourceMapResolver = (
  options: SourceMapResolverOptions
): SourceMapResolver => {
  let scripts = new Map<string, Promise<LoadedScript>>();

  const allows = options.allows ?? (() => true);

  const loadMap = async (
    scriptUrl: string,
    ref: string | undefined
  ): Promise<TraceMap | undefined> => {
    if (ref === undefined || ref === '') return undefined;
    if (/^data:/i.test(ref)) {
      return new FlattenMap(decodeDataUrl(ref), scriptUrl);
    }
    const mapUrl = new URL(ref, scriptUrl).href;
    if (!allows(mapUrl)) return undefined;
    const mapRes = await options.fetch(mapUrl);
    if (!mapRes.ok) return undefined;
    return new FlattenMap(await mapRes.text(), mapUrl);
  };

  const loadScript = async (scriptUrl: string): Promise<LoadedScript> => {
    const loaded: LoadedScript = {};
    try {
      if (!allows(scriptUrl)) return loaded;
      const res = await options.fetch(scriptUrl);
      if (!res.ok) return loaded;
      const header =
        res.headers.get('SourceMap') ?? res.headers.get('X-SourceMap');
      loaded.code = await res.text();
      loaded.map = await loadMap(
        scriptUrl,
        header ?? sourceMappingUrlOf(loaded.code)
      );
    } catch {
      // What loaded so far stands; a map that failed is just absent.
    }
    return loaded;
  };

  const scriptOf = (scriptUrl: string): Promise<LoadedScript> => {
    let script = scripts.get(scriptUrl);
    if (script === undefined) {
      script = loadScript(scriptUrl);
      scripts.set(scriptUrl, script);
    }
    return script;
  };

  const mapOf = async (scriptUrl: string): Promise<TraceMap | undefined> =>
    (await scriptOf(scriptUrl)).map;

  /** The `<tag` a site names, searched for in `text`. */
  const findIn = (text: string, site: TemplateSite) => {
    const offsets = findTemplate(text, site.strings);
    if (offsets === undefined) return undefined;
    const at = tagOffset(offsets, site.strings, site.tag, site.index);
    return at === undefined ? undefined : lineColumnOf(text, at);
  };

  /** A site found in a source a script maps to: the project's own first. */
  const locateInSources = (
    map: TraceMap,
    site: TemplateSite
  ): ElementSource | undefined => {
    const order = map.resolvedSources
      .map((source, i) => ({source, i}))
      .sort(
        (a, b) =>
          Number(NODE_MODULES_RE.test(a.source)) -
          Number(NODE_MODULES_RE.test(b.source))
      );
    for (const {source, i} of order) {
      const text = map.sourcesContent?.[i];
      if (typeof text !== 'string') continue;
      const pos = findIn(text, site);
      if (pos !== undefined) {
        return {file: displayPath(source), ...pos, url: source};
      }
    }
    return undefined;
  };

  /** A site found in a script's own text, mapped back when the map can. */
  const locateInScript = (
    url: string,
    {code, map}: LoadedScript,
    site: TemplateSite
  ): ElementSource | undefined => {
    if (code === undefined) return undefined;
    const pos = findIn(code, site);
    if (pos === undefined) return undefined;
    const generated = {url, ...pos};
    const original =
      map === undefined
        ? undefined
        : originalPositionFor(map, {line: pos.line, column: pos.column - 1});
    if (original?.source != null) {
      return {
        file: displayPath(original.source),
        line: original.line,
        column: original.column + 1,
        url: original.source,
        generated,
      };
    }
    return {file: displayPath(url), ...pos, url, generated};
  };

  const mapFrame = async (
    frame: GeneratedFrame
  ): Promise<Mapped | undefined> => {
    const map = await mapOf(frame.url);
    if (map === undefined) return undefined;
    try {
      // The browser prints 1-based columns; trace-mapping wants 0-based.
      const column = Math.max(0, frame.column - 1);
      const pos = originalPositionFor(map, {line: frame.line, column});
      if (pos.source === null) return undefined;
      return {
        frame,
        source: pos.source,
        line: pos.line,
        column: pos.column,
        ignored: isIgnored(map, pos.source),
        // traceSegment takes a 0-based line.
        exact: traceSegment(map, frame.line - 1, column)?.[0] === column,
      };
    } catch {
      return undefined;
    }
  };

  return {
    async resolve(frames) {
      const mapped = (await Promise.all(frames.map(mapFrame))).filter(
        (m): m is Mapped => m !== undefined
      );
      const own = (m: Mapped) => !m.ignored && !NODE_MODULES_RE.test(m.source);
      const pick =
        mapped.find((m) => own(m) && m.exact) ??
        mapped.find(own) ??
        mapped.find((m) => !LIT_PACKAGE_RE.test(m.source)) ??
        mapped[0];
      if (pick === undefined) return undefined;
      return {
        file: displayPath(pick.source),
        line: pick.line,
        // ElementSource columns are 1-based, as call sites are.
        column: pick.column + 1,
        url: pick.source,
        generated: pick.frame,
      };
    },
    async locate(site) {
      const loaded = await Promise.all(
        site.scripts.map(async (url) => ({url, script: await scriptOf(url)}))
      );
      try {
        for (const {script} of loaded) {
          const found =
            script.map === undefined
              ? undefined
              : locateInSources(script.map, site);
          if (found !== undefined) return found;
        }
        for (const {url, script} of loaded) {
          const found = locateInScript(url, script, site);
          if (found !== undefined) return found;
        }
      } catch {
        // A map that does not read as expected.
      }
      return undefined;
    },
    reset() {
      scripts = new Map();
    },
  };
};
