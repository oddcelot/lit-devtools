import {expect, test} from 'vite-plus/test';
import {extractModuleDocs} from '../../lib/component-docs/extract.js';
import type {DocsFs} from '../../lib/component-docs/load.js';
import {createPackageAncestors} from '../../lib/component-docs/package-ancestors.js';
import {createSourceDocsIndex} from '../../lib/component-docs/source-index.js';
import {writeManifest} from '../../lib/component-docs/write-manifest.js';

const PKG = '/app/node_modules/@ui/kit';

const KIT_MANIFEST = {
  schemaVersion: '2.1.0',
  modules: [
    {
      kind: 'javascript-module',
      path: 'dist/badge.js',
      declarations: [
        {
          kind: 'class',
          name: 'UiBadge',
          customElement: true,
          tagName: 'ui-badge',
          members: [
            {
              kind: 'field',
              name: 'variant',
              description: 'The tone.',
              default: "'brand'",
              attribute: 'variant',
            },
            {
              kind: 'field',
              name: 'size',
              attribute: 'size',
              inheritedFrom: {name: 'UiElement'},
            },
            {kind: 'field', name: 'internal', privacy: 'private'},
          ],
          attributes: [
            {name: 'variant', fieldName: 'variant'},
            {name: 'size', fieldName: 'size'},
          ],
          slots: [{name: '', description: 'The label.'}],
        },
      ],
      exports: [
        {
          kind: 'js',
          name: 'default',
          declaration: {name: 'UiBadge', module: 'dist/badge.js'},
        },
      ],
    },
    {
      kind: 'javascript-module',
      path: 'dist/focusable.js',
      declarations: [
        {
          kind: 'mixin',
          name: 'Focusable',
          members: [{kind: 'field', name: 'autofocus'}],
        },
      ],
    },
  ],
};

/** An in-memory tree: path to text. */
const memoryFs = (files: Record<string, string>): DocsFs => ({
  readFile: (path) => files[path],
  mtime: (path) => (path in files ? 1 : undefined),
});

const FILES = {
  [`${PKG}/package.json`]: JSON.stringify({
    name: '@ui/kit',
    customElements: 'custom-elements.json',
  }),
  [`${PKG}/custom-elements.json`]: JSON.stringify(KIT_MANIFEST),
  '/app/node_modules/plain/package.json': JSON.stringify({name: 'plain'}),
};

const project = () => {
  const index = createSourceDocsIndex(
    (id) => id.replace('/app/', ''),
    createPackageAncestors(memoryFs(FILES))
  );
  index.set(
    '/app/src/x-badge.ts',
    extractModuleDocs(
      `
      import UiBadge from '@ui/kit/dist/badge.js';
      import {Focusable} from '@ui/kit/dist/focusable.js';
      import {Plain} from 'plain';
      @customElement('x-badge')
      export class XBadge extends Focusable(UiBadge) {
        constructor() { super(); this.variant = 'neutral'; }
        /** Own. */
        @property() label = '';
      }
      @customElement('x-plain')
      export class XPlain extends Plain {}
    `,
      '/app/src/x-badge.ts'
    ),
    new Map([
      ['@ui/kit/dist/badge.js', `${PKG}/dist/badge.js`],
      ['@ui/kit/dist/focusable.js', `${PKG}/dist/focusable.js?v=1`],
      ['plain', '/app/node_modules/plain/index.js'],
    ])
  );
  return index;
};

test('a class extending a package element inherits from its manifest', () => {
  const docs = project().get('x-badge')!;
  expect(
    docs.properties.map((p) => [p.name, p.inheritedFrom, p.default])
  ).toEqual([
    ['label', undefined, "''"],
    ['autofocus', 'Focusable', undefined],
    // The constructor re-defaults the inherited property.
    ['variant', 'UiBadge', "'neutral'"],
    // The package's own `inheritedFrom` is kept.
    ['size', 'UiElement', undefined],
  ]);
  expect(docs.slots).toEqual([
    {name: '', description: 'The label.', inheritedFrom: 'UiBadge'},
  ]);
});

test('a package with no manifest ends the walk', () => {
  expect(project().get('x-plain')!.properties).toEqual([]);
});

test('the manifest names a package ancestor by package and module', () => {
  const manifest = writeManifest(project().modules(), {
    path: (id) => id.replace('/app/', ''),
  });
  const [xBadge] = manifest.modules[0].declarations as {
    members: {name: string; inheritedFrom?: unknown}[];
  }[];
  expect(xBadge.members.find((m) => m.name === 'size')?.inheritedFrom).toEqual({
    name: 'UiBadge',
    package: '@ui/kit',
    module: 'dist/badge.js',
  });
});
