import {expect, test, vi} from 'vite-plus/test';
import {createLinkedDocsSource} from '../../lib/component-docs/linked.js';

const manifest = (tagName: string) =>
  JSON.stringify({
    schemaVersion: '2.1.0',
    modules: [
      {
        kind: 'javascript-module',
        path: 'x.js',
        declarations: [
          {
            kind: 'class',
            name: 'X',
            customElement: true,
            tagName,
            description: `About ${tagName}`,
          },
        ],
      },
    ],
  });

const site = 'https://app.test';

const setup = (files: Record<string, string>, links = Object.keys(files)) => {
  const fetchText = vi.fn(async (url: string) => files[url]);
  const source = createLinkedDocsSource({
    links: async () => links,
    fetchText,
    allows: (url) => url.startsWith(`${site}/`),
  });
  return {source, fetchText};
};

test('finds a tag in the manifests the page links to, in order', async () => {
  const {source} = setup({
    [`${site}/a.json`]: manifest('x-a'),
    [`${site}/b.json`]: manifest('x-b'),
  });
  const {docs} = await source.componentDocs({tagName: 'x-b'});
  expect(docs).toMatchObject({
    tagName: 'x-b',
    description: 'About x-b',
    origin: {manifest: `${site}/b.json`},
  });
  expect((await source.componentDocs({tagName: 'x-c'})).docs).toBeNull();
});

test('fetches each manifest once until reset', async () => {
  const {source, fetchText} = setup({[`${site}/a.json`]: manifest('x-a')});
  await source.componentDocs({tagName: 'x-a'});
  await source.componentDocs({tagName: 'x-a'});
  expect(fetchText).toHaveBeenCalledTimes(1);
  source.reset();
  await source.componentDocs({tagName: 'x-a'});
  expect(fetchText).toHaveBeenCalledTimes(2);
});

test('skips links the host may not fetch, and broken manifests', async () => {
  const {source, fetchText} = setup(
    {
      'https://cdn.test/a.json': manifest('x-a'),
      [`${site}/broken.json`]: '{nope',
      [`${site}/ok.json`]: manifest('x-a'),
    },
    [
      'https://cdn.test/a.json',
      `${site}/broken.json`,
      `${site}/missing.json`,
      `${site}/ok.json`,
    ]
  );
  const {docs} = await source.componentDocs({tagName: 'x-a'});
  expect(docs?.origin.manifest).toBe(`${site}/ok.json`);
  expect(fetchText).not.toHaveBeenCalledWith('https://cdn.test/a.json');
});

test('answers no docs when the page cannot be asked or a fetch throws', async () => {
  const noPage = createLinkedDocsSource({
    links: () => Promise.reject(new Error('gone')),
    fetchText: async () => undefined,
    allows: () => true,
  });
  expect((await noPage.componentDocs({tagName: 'x-a'})).docs).toBeNull();
  const throwing = createLinkedDocsSource({
    links: async () => [`${site}/a.json`],
    fetchText: () => Promise.reject(new Error('offline')),
    allows: () => true,
  });
  expect((await throwing.componentDocs({tagName: 'x-a'})).docs).toBeNull();
});

test('names the package a manifest under node_modules ships with', async () => {
  const inStore = `${site}/@fs/home/me/app/node_modules/.pnpm/@awesome.me+webawesome@3.14.0/node_modules/@awesome.me/webawesome/dist/custom-elements.json`;
  const {source} = setup({
    [inStore]: manifest('wa-card'),
    [`${site}/custom-elements.json`]: manifest('x-own'),
  });
  expect(
    (await source.componentDocs({tagName: 'wa-card'})).docs?.origin
  ).toEqual({
    manifest: inStore,
    package: '@awesome.me/webawesome',
    module: 'x.js',
  });
  // The site's own manifest belongs to no package.
  expect((await source.componentDocs({tagName: 'x-own'})).docs?.origin).toEqual(
    {manifest: `${site}/custom-elements.json`, module: 'x.js'}
  );
});
