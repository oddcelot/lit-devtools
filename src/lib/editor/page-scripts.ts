/**
 * The components a page defines in its own scripts: an Astro component's
 * `<script>`, or an HTML file's inline `<script type="module">`, often holds
 * the class and its `customElements.define`.
 *
 * A page is read as one module the length of the file, its scripts in place
 * and everything around them blanked, so every offset the reader finds, and
 * go to implementation lands on, is an offset into the page.
 */

import {type MarkupElement, pageScripts} from './markup.js';

const PAGE_RE = /\.(?:html|astro)$/;

/** Script types a browser runs; any other `type` holds data or a template. */
const RUN_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
]);

/** Whether `file` is a page whose scripts can define components. */
export const isScriptPage = (file: string): boolean => PAGE_RE.test(file);

/**
 * Whether a `<script>` holds code that runs: not one with a `src`, whose
 * body the browser ignores (the file it loads is read on its own), nor data
 * such as JSON or an import map. Astro's `is:inline` scripts run as written,
 * so they count.
 */
const runs = (code: string, script: MarkupElement): boolean => {
  if (script.attributes.some((a) => a.name.toLowerCase() === 'src'))
    return false;
  const type = script.attributes.find((a) => a.name.toLowerCase() === 'type');
  const value = type?.value ? code.slice(type.value.start, type.value.end) : '';
  return RUN_TYPES.has(value.trim().toLowerCase());
};

/** `text` with everything but line breaks turned to spaces. */
const blank = (text: string): string => text.replace(/[^\r\n]/g, ' ');

/**
 * The code a file holds as a module: a script as it is, and a page as its
 * running scripts at their own offsets, with the rest blanked.
 */
export const scriptView = (code: string, file: string): string => {
  if (!isScriptPage(file)) return code;
  const kind = file.endsWith('.astro') ? 'astro' : 'html';
  let view = '';
  let at = 0;
  for (const script of pageScripts(code, kind)) {
    if (!script.content || !runs(code, script)) continue;
    const {start, end} = script.content;
    view += blank(code.slice(at, start)) + code.slice(start, end);
    at = end;
  }
  return view + blank(code.slice(at));
};
