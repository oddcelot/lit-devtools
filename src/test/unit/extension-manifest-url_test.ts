import {describe, expect, test} from 'vite-plus/test';
import {
  MANIFEST_IGNORED_KEY,
  MANIFEST_URLS_KEY,
  parseManifestUrl,
  readIgnoredManifests,
  readManifests,
  setManifestIgnored,
  writeManifests,
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
    ).toEqual({url: `${ORIGIN}/dist/custom-elements.json`, otherSite: false});
    expect(
      parseManifestUrl(' custom-elements.json ', PAGE, ORIGIN, site)
    ).toEqual({url: `${PAGE}custom-elements.json`, otherSite: false});
    expect(parseManifestUrl(`${ORIGIN}/cem.json`, PAGE, ORIGIN, site)).toEqual({
      url: `${ORIGIN}/cem.json`,
      otherSite: false,
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
    ).toEqual({url: 'http://localhost:5173/cem.json', otherSite: false});
  });

  test('refuses empty input', () => {
    expect(parseManifestUrl('  ', PAGE, ORIGIN, site)).toEqual({
      error: 'Enter a path or a URL',
    });
  });

  test('takes another site only when the browser can ask for it', () => {
    expect(
      parseManifestUrl('https://cdn.example/cem.json', PAGE, ORIGIN, site)
    ).toMatchObject({error: expect.stringContaining(`Must be on ${ORIGIN}`)});
    expect(
      parseManifestUrl('https://cdn.example/cem.json', PAGE, ORIGIN, site, true)
    ).toEqual({url: 'https://cdn.example/cem.json', otherSite: true});
  });

  test('refuses other schemes', () => {
    expect(parseManifestUrl('data:,{}', PAGE, ORIGIN, site)).toEqual({
      error: 'Not an http(s) URL',
    });
  });
});

test('stores a list per origin, and drops an empty one', async () => {
  const area = fakeArea();
  const list = [
    {url: `${ORIGIN}/a.json`, enabled: true},
    {url: `${ORIGIN}/l.json`, enabled: false, linked: true as const},
  ];
  await writeManifests(area, ORIGIN, list);
  await writeManifests(area, 'https://other.test', [
    {url: 'https://other.test/c.json', enabled: true},
  ]);
  expect(await readManifests(area, ORIGIN)).toEqual(list);
  await writeManifests(area, ORIGIN, []);
  expect(await readManifests(area, ORIGIN)).toEqual([]);
  expect(Object.keys(area.store[MANIFEST_URLS_KEY] as object)).toEqual([
    'https://other.test',
  ]);
});

test('reads URLs an earlier build stored as switched-on entries', async () => {
  const area = fakeArea();
  area.store[MANIFEST_URLS_KEY] = {[ORIGIN]: `${ORIGIN}/old.json`};
  expect(await readManifests(area, ORIGIN)).toEqual([
    {url: `${ORIGIN}/old.json`, enabled: true},
  ]);
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
