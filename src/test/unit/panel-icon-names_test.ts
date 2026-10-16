/// <reference types="vite/client" />
import {expect, test} from 'vite-plus/test';

// The panel's `default` icon library holds only the icons `wa-icons.ts`
// lists, and an unlisted name renders an empty box with no error. Every
// literal `<wa-icon name="…">` in the panel must be one of them.
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
  for (const [path, code] of Object.entries(sources)) {
    for (const [, name] of code.matchAll(
      /<wa-icon\b[^>]*?\sname="([a-z-]+)"/g
    )) {
      if (!known.has(name!)) missing.push(`${path}: ${name}`);
    }
  }
  expect(missing).toEqual([]);
});
