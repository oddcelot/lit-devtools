/// <reference types="vite/client" />
import {expect, test} from 'vite-plus/test';

// The panel's `default` icon library holds only the icons `wa-icons.ts`
// lists, and an unlisted name renders an empty box with no error. Every
// literal icon name in the panel (`<lit-icon name>`, `<lit-icon-button
// icon>`) must be one of them.
const sources = import.meta.glob<string>('../../panel/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const listed = (): Set<string> => {
  const file = sources['../../panel/wa-icons.ts']!;
  const block = file.slice(
    file.indexOf('const ICONS = {'),
    file.indexOf('} as const;')
  );
  return new Set(
    [...block.matchAll(/^\s*(?:'([a-z-]+)'|([a-zA-Z]+))[,:]/gm)].map(
      ([, quoted, bare]) => quoted ?? bare!
    )
  );
};

test('every icon the panel names is in its icon library', () => {
  const known = listed();
  expect(known.has('caret-up')).toBe(true);
  const missing: string[] = [];
  let seen = 0;
  // A `<lit-icon name>`, or a `<lit-icon-button icon>`. Attributes can hold
  // `=>` (event handlers), so a match runs to the next tag, not the next `>`.
  const literal =
    /<(?:wa-icon|lit-icon)\b(?:(?!<)[\s\S])*?\sname="([a-z-]+)"|<lit-icon-button\b(?:(?!<)[\s\S])*?\sicon="([a-z-]+)"/g;
  for (const [path, code] of Object.entries(sources)) {
    for (const [, iconName, buttonIcon] of code.matchAll(literal)) {
      const name = iconName ?? buttonIcon!;
      seen++;
      if (!known.has(name)) missing.push(`${path}: ${name}`);
    }
  }
  expect(seen).toBeGreaterThan(30);
  expect(missing).toEqual([]);
});
