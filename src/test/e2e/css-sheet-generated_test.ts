import type {Plugin} from 'vite';
import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {dataRenders, type Fixture, fsp, startFixture} from './utils.js';

/**
 * A `?css-sheet` whose CSS another plugin generates from other source files,
 * the way Tailwind does: a class written in a component has to reach the
 * shared sheet. The stand-in below behaves like `@tailwindcss/vite` where it
 * matters: it adds rules to a `.css` module from a file it watches with
 * `addWatchFile`, and it leaves `?url` imports alone. A sheet fetched over
 * `?url` never sees its output change; one built from `?inline` does.
 */

const generator = (): Plugin => ({
  name: 'test:generated-css',
  enforce: 'pre',
  async transform(code, id) {
    if (!/hmr-vsheet\.css(\?|$)/.test(id) || /[?&]url\b/.test(id)) {
      return null;
    }
    const source = id.replace(/[^/]*$/, 'hmr-vsheet-a.ts');
    this.addWatchFile(source);
    const width = /ring-(\d+)/.exec(await fsp.readFile(source, 'utf8'))?.[1];
    return width === undefined
      ? null
      : `${code}\n.chip { outline: ${width}px solid red; }\n`;
  },
});

let fixture: Fixture;

beforeAll(async () => {
  fixture = await startFixture({plugins: [generator()]});
});

afterAll(async () => {
  await fixture?.close();
});

const outline = (host: string) =>
  fixture.page
    .evaluate((host) => {
      const chip = document
        .querySelector(host)
        ?.shadowRoot?.querySelector('#chip');
      return chip ? getComputedStyle(chip).outlineWidth : null;
    }, host)
    .catch(() => null);

test('a class in one component reaches the sheet every adopter shares', async () => {
  await expect.poll(() => outline('hmr-vsheet-b')).toBe('3px');

  await fixture.edit('src/hmr-vsheet-a.ts', (code) => `${code}\n// ring-9\n`);

  // B never changed, so the new rule reaches it only through the sheet.
  await expect
    .poll(() => outline('hmr-vsheet-b'), {timeout: 10_000})
    .toBe('9px');
  expect(await dataRenders(fixture.page, 'hmr-vsheet-b')).toBe('1');
});
