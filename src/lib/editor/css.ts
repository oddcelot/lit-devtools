/**
 * CSS in a script's `css` tagged templates, prepared for a CSS language
 * service: the script as one CSS text of the same length, everything outside
 * the templates and every `${…}` hole blanked to spaces, line breaks kept,
 * so a position in it is the same position in the script.
 *
 * Plus what only the components' docs know: the custom properties they
 * document after `var(--`, and the parts they expose after `::part(`.
 */

import type {DocEntry} from '../../types/component-docs.js';
import type {Completion, DocsSource} from './features.js';
import {type TemplateRegion, findTemplates} from './templates.js';

export interface CssText {
  /** The script's length, CSS only where the templates are. */
  text: string;
  regions: TemplateRegion[];
  /** Lines that hold a hole, whose CSS may be incomplete on purpose. */
  holeLines: Set<number>;
}

const blank = (text: string): string => text.replace(/[^\r\n]/g, ' ');

const lineOf = (code: string, offset: number): number =>
  code.slice(0, offset).split('\n').length - 1;

/** The script's `css` templates as one CSS text, or undefined without any. */
export const cssTextOf = (
  code: string,
  tags: readonly string[] = ['css']
): CssText | undefined => {
  const regions = findTemplates(code, tags);
  if (regions.length === 0) return undefined;
  let text = '';
  let at = 0;
  const holeLines = new Set<number>();
  for (const region of regions) {
    text += blank(code.slice(at, region.start));
    at = region.start;
    for (const hole of region.holes) {
      text +=
        code.slice(at, hole.start) + blank(code.slice(hole.start, hole.end));
      for (
        let line = lineOf(code, hole.start);
        line <= lineOf(code, hole.end);
        line++
      ) {
        holeLines.add(line);
      }
      at = hole.end;
    }
    text += code.slice(at, region.end);
    at = region.end;
  }
  return {text: text + blank(code.slice(at)), regions, holeLines};
};

/** Whether `offset` is CSS: inside a template and outside its holes. */
export const inCss = (css: CssText, offset: number): boolean =>
  css.regions.some(
    (region) =>
      region.start <= offset &&
      offset <= region.end &&
      !region.holes.some((hole) => hole.start < offset && offset < hole.end)
  );

const VAR_RE = /var\(\s*(--[\w-]*)$/;
const PART_RE = /::part\(\s*([\w-]*)$/;

/** What is being typed before the cursor: a custom property or a part name. */
const typedAt = (
  code: string,
  offset: number
): {what: 'property' | 'part'; typed: string} | undefined => {
  const before = code.slice(Math.max(0, offset - 200), offset);
  const variable = VAR_RE.exec(before)?.[1];
  if (variable !== undefined) return {what: 'property', typed: variable};
  const part = PART_RE.exec(before)?.[1];
  return part === undefined ? undefined : {what: 'part', typed: part};
};

const entryCompletion = (
  entry: DocEntry,
  tagName: string,
  what: 'property' | 'part',
  start: number,
  end: number
): Completion => ({
  label: entry.name,
  kind: what === 'property' ? 12 : 10,
  detail: [entry.default ? `= ${entry.default}` : '', `from <${tagName}>`]
    .filter(Boolean)
    .join(' '),
  documentation: [
    `**\`${entry.name}\`** ${what === 'property' ? 'custom property' : 'part'} of \`<${tagName}>\``,
    entry.description ?? '',
  ]
    .filter(Boolean)
    .join('\n\n'),
  start,
  end,
  newText: entry.name,
});

/**
 * The documented custom properties after `var(--`, and part names after
 * `::part(`, of the components `file` can use, each name once.
 */
export const cssDocCompletions = async (
  source: DocsSource,
  file: string,
  code: string,
  offset: number
): Promise<Completion[]> => {
  const at = typedAt(code, offset);
  if (!at) return [];
  const tags = await source.tags(file);
  const docs = await Promise.all(tags.map((tag) => source.get(file, tag)));
  const seen = new Set<string>();
  return docs.flatMap((component) => {
    if (!component) return [];
    const entries =
      at.what === 'property' ? component.cssProperties : component.cssParts;
    return entries
      .filter((entry) => !seen.has(entry.name) && seen.add(entry.name))
      .map((entry) =>
        entryCompletion(
          entry,
          component.tagName,
          at.what,
          offset - at.typed.length,
          offset
        )
      );
  });
};
