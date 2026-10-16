import {describe, expect, test} from 'vite-plus/test';
import {
  MANIFEST_URLS_KEY,
  parseManifestUrl,
  readManifestUrl,
  writeManifestUrl,
} from '../../../extension/src/manifest-url.js';

// `chrome.storage.local` as far as the setting uses it.
const fakeArea = () => {
  const store: Record<string, unknown> = {};
  return {
    store,
    async get(key: string) {
      return key in store ? {[key]: structuredClone(store[key])} : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, structuredClone(items));
    },
  };
};

const ORIGIN = 'https://webawesome.com';
const PAGE = `${ORIGIN}/docs/components/accordion/`;
const site = (url: string) => new URL(url).origin;
// Firefox compares hosts without their port.
const hostOnly = (url: string) => {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}`;
};

describe('parseManifestUrl', () => {
  test('resolves a path against the page, and keeps an absolute URL', () => {
    expect(
      parseManifestUrl('/dist/custom-elements.json', PAGE, ORIGIN, site)
    ).toEqual({url: `${ORIGIN}/dist/custom-elements.json`});
    expect(
      parseManifestUrl(' custom-elements.json ', PAGE, ORIGIN, site)
    ).toEqual({url: `${PAGE}custom-elements.json`});
    expect(parseManifestUrl(`${ORIGIN}/cem.json`, PAGE, ORIGIN, site)).toEqual({
      url: `${ORIGIN}/cem.json`,
    });
  });

  test('keeps the page port for a path, where the site has none', () => {
    expect(
      parseManifestUrl(
        '/cem.json',
        'http://localhost:5173/x',
        'http://localhost',
        hostOnly
      )
    ).toEqual({url: 'http://localhost:5173/cem.json'});
  });

  test('empty input clears it', () => {
    expect(parseManifestUrl('  ', PAGE, ORIGIN, site)).toEqual({
      url: undefined,
    });
  });

  test('refuses another site and other schemes', () => {
    expect(
      parseManifestUrl('https://cdn.example/cem.json', PAGE, ORIGIN, site)
    ).toEqual({error: `Must be on ${ORIGIN}`});
    expect(parseManifestUrl('data:,{}', PAGE, ORIGIN, site)).toEqual({
      error: 'Not an http(s) URL',
    });
  });
});

test('keeps one URL per origin, and forgets one on clear', async () => {
  const area = fakeArea();
  await writeManifestUrl(area, ORIGIN, `${ORIGIN}/a.json`);
  await writeManifestUrl(
    area,
    'https://other.test',
    'https://other.test/b.json'
  );
  expect(await readManifestUrl(area, ORIGIN)).toBe(`${ORIGIN}/a.json`);
  await writeManifestUrl(area, ORIGIN, undefined);
  expect(await readManifestUrl(area, ORIGIN)).toBeUndefined();
  expect(area.store[MANIFEST_URLS_KEY]).toEqual({
    'https://other.test': 'https://other.test/b.json',
  });
});
