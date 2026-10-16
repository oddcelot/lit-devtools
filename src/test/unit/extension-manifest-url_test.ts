import {describe, expect, test} from 'vite-plus/test';
import {
  MANIFEST_IGNORED_KEY,
  MANIFEST_URLS_KEY,
  addManifestUrl,
  parseManifestUrl,
  readIgnoredManifests,
  readManifestUrls,
  removeManifestUrl,
  setManifestIgnored,
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

  test('refuses empty input', () => {
    expect(parseManifestUrl('  ', PAGE, ORIGIN, site)).toEqual({
      error: 'Enter a path or a URL',
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

test('keeps a list per origin: added once each, in order, dropped when empty', async () => {
  const area = fakeArea();
  await addManifestUrl(area, ORIGIN, `${ORIGIN}/a.json`);
  await addManifestUrl(area, ORIGIN, `${ORIGIN}/b.json`);
  await addManifestUrl(area, ORIGIN, `${ORIGIN}/a.json`);
  await addManifestUrl(area, 'https://other.test', 'https://other.test/c.json');
  expect(await readManifestUrls(area, ORIGIN)).toEqual([
    `${ORIGIN}/a.json`,
    `${ORIGIN}/b.json`,
  ]);
  await removeManifestUrl(area, ORIGIN, `${ORIGIN}/a.json`);
  await removeManifestUrl(area, ORIGIN, `${ORIGIN}/b.json`);
  expect(await readManifestUrls(area, ORIGIN)).toEqual([]);
  expect(area.store[MANIFEST_URLS_KEY]).toEqual({
    'https://other.test': ['https://other.test/c.json'],
  });
});

test('reads a single URL an earlier build stored as a list of it', async () => {
  const area = fakeArea();
  area.store[MANIFEST_URLS_KEY] = {[ORIGIN]: `${ORIGIN}/old.json`};
  expect(await readManifestUrls(area, ORIGIN)).toEqual([`${ORIGIN}/old.json`]);
});

test('ignores and resets found manifests one by one', async () => {
  const area = fakeArea();
  await setManifestIgnored(area, ORIGIN, `${ORIGIN}/a.json`, true);
  await setManifestIgnored(area, ORIGIN, `${ORIGIN}/b.json`, true);
  await setManifestIgnored(area, ORIGIN, `${ORIGIN}/a.json`, false);
  expect(await readIgnoredManifests(area, ORIGIN)).toEqual([
    `${ORIGIN}/b.json`,
  ]);
  expect(Object.keys(area.store)).toContain(MANIFEST_IGNORED_KEY);
});
