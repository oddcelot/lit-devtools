/**
 * Reads the type text the docs carry, `CustomEvent<{id: string}>`, without a
 * type checker: the members of an object shape, a `CustomEvent`'s detail,
 * and whether one type plainly can't stand in for another. What can't be
 * read this way (named types, unions, intersections) is left alone.
 */

export interface Member {
  name: string;
  type: string;
  optional?: true;
}

/** `text` split at `separators` outside any brackets; `=>` closes nothing. */
const splitTopLevel = (text: string, separators: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if ('{[(<'.includes(char)) depth++;
    else if ('}])'.includes(char) || (char === '>' && text[i - 1] !== '=')) {
      depth--;
    } else if (depth === 0 && separators.includes(char)) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
  }
  return [...parts, text.slice(from)].map((p) => p.trim()).filter(Boolean);
};

/** The keys of an object shape, `{id: string; at?: number}`. */
export const objectMembers = (type: string): Member[] | undefined => {
  const body = /^\{([\s\S]*)\}$/.exec(type.trim())?.[1];
  if (body === undefined) return undefined;
  return splitTopLevel(body, ';,').flatMap((field) => {
    const [key, ...rest] = splitTopLevel(field, ':');
    if (!key || rest.length === 0) return [];
    const optional = key.endsWith('?');
    return [
      {
        name: optional ? key.slice(0, -1) : key,
        type: rest.join(': '),
        ...(optional ? {optional: true as const} : {}),
      },
    ];
  });
};

/** The type argument of `CustomEvent<T>`, or undefined for any other event. */
export const detailOf = (eventType: string): string | undefined =>
  /^CustomEvent<([\s\S]+)>$/.exec(eventType.trim())?.[1];

const PRIMITIVES = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'null',
  'undefined',
]);

const normal = (type: string): string => type.replace(/\s+/g, ' ').trim();

/** The first key of `wanted` that `had` lacks or holds as something else. */
const membersMismatch = (
  had: Member[],
  wanted: Member[],
  path: string
): string | undefined => {
  for (const member of wanted) {
    const found = had.find((m) => m.name === member.name);
    const at = `${path}.${member.name}`;
    if (!found && !member.optional) return `\`${at}\` is missing`;
    const reason = found && shapeMismatch(found.type, member.type, at);
    if (reason) return reason;
  }
  return undefined;
};

/** Why `actual` can't be read as `expected`, at `path`; undefined when it can or nobody can tell. */
const shapeMismatch = (
  actual: string,
  expected: string,
  path: string
): string | undefined => {
  const [have, want] = [normal(actual), normal(expected)];
  if (have === want) return undefined;
  const wanted = objectMembers(want);
  if (PRIMITIVES.has(have) && (wanted || PRIMITIVES.has(want))) {
    return `\`${path}\` is \`${have}\`, not ${wanted ? 'an object' : `\`${want}\``}`;
  }
  const had = objectMembers(have);
  return wanted && had ? membersMismatch(had, wanted, path) : undefined;
};

/**
 * Why an event of type `actual` doesn't fit a handler taking `expected`, or
 * undefined when it does or that can't be told from the text. Only two
 * `CustomEvent`s' details are compared: a key the handler expects that the
 * event lacks, or a primitive where another is expected.
 */
export const typeMismatch = (
  actual: string,
  expected: string
): string | undefined => {
  const have = detailOf(actual);
  const want = detailOf(expected);
  return have && want ? shapeMismatch(have, want, 'detail') : undefined;
};
