import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import type {Plugin} from 'vite';
import type {
  ComponentDocs,
  DocEntry,
} from '../../../src/types/component-docs.js';
// The plugin's own docs readers, from the root package's build output (the
// kitchen sink needs that build anyway, for litPlugin()).
import {extractModuleDocs} from '../../../lib/component-docs/extract.js';
import {docsFromManifest} from '../../../lib/component-docs/manifest.js';

/** Where the page fetches the docs from. */
const DOCS_PATH = '/__kitchen-sink/docs.json';
const SRC = new URL('../src/', import.meta.url);
const WA_PREFIX = '@awesome.me/webawesome/dist/';

/** Own entries first, then the base class's that it doesn't already name. */
const merge = (own: DocEntry[], base: DocEntry[], from: string) => [
  ...own,
  ...base
    .filter((b) => !own.some((o) => o.name === b.name))
    .map((b) => ({...b, inheritedFrom: from})),
];

const MEMBER_KINDS = [
  'properties',
  'attributes',
  'events',
  'slots',
  'cssParts',
  'cssProperties',
  'cssStates',
] as const;

type ClassDocs = ReturnType<typeof extractModuleDocs>['classes'][number];

/** Web Awesome's documented elements, keyed by declaring module. */
const webAwesomeDocs = () => {
  const require = createRequire(import.meta.url);
  const path =
    require.resolve('@awesome.me/webawesome/dist/custom-elements.json');
  const docs = docsFromManifest(JSON.parse(readFileSync(path, 'utf8')), {
    package: '@awesome.me/webawesome',
    manifest: 'dist/custom-elements.json',
  });
  return new Map(docs.map((d) => [d.origin.module, d]));
};

/** The WA element a class extends, when it extends one. */
const baseOf = (cls: ClassDocs, wa: Map<string, ComponentDocs>) => {
  const spec = cls.superclass?.specifier ?? '';
  return spec.startsWith(WA_PREFIX)
    ? wa.get(spec.slice(WA_PREFIX.length))
    : undefined;
};

/** One element's docs: its own, then what it inherits from `base`. */
const elementDocs = (
  cls: ClassDocs & {tagName: string},
  file: string,
  base: ComponentDocs | undefined
): ComponentDocs => {
  const docs: ComponentDocs = {
    ...cls.docs,
    tagName: cls.tagName,
    className: cls.name,
    origin: {manifest: '', module: `src/${file}`, source: true},
  };
  if (base === undefined) return docs;
  docs.summary ??= base.summary;
  for (const key of MEMBER_KINDS) {
    docs[key] = merge(cls.docs[key], base[key], base.className);
  }
  return docs;
};

/** Every lit-* element in src/, by tag. */
const build = () => {
  const wa = webAwesomeDocs();
  const result: Record<string, ComponentDocs> = {};
  for (const file of readdirSync(SRC).filter((f) => f.endsWith('.ts'))) {
    const path = new URL(file, SRC).pathname;
    const {classes} = extractModuleDocs(readFileSync(path, 'utf8'), path);
    for (const cls of classes) {
      if (cls.tagName === undefined) continue;
      result[cls.tagName] = elementDocs(
        cls as ClassDocs & {tagName: string},
        file,
        baseOf(cls, wa)
      );
    }
  }
  return result;
};

/**
 * Serves every lit-* element's documented API at {@link DOCS_PATH}: a
 * `{[tagName]: ComponentDocs}` the page builds its variant grids and API
 * tables from, read afresh on each request. A leaf's own members come from
 * its source, read the way the DevTools read a project's components;
 * everything it inherits comes from Web Awesome's custom-elements.json,
 * under the base class's module.
 */
export const kitchenSinkDocs = (): Plugin => ({
  name: 'kitchen-sink-docs',
  configureServer(server) {
    server.middlewares.use(DOCS_PATH, (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(build()));
    });
  },
});
