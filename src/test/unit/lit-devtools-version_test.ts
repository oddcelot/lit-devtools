/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {expect, test} from 'vite-plus/test';

const versionOf = (path: string): string =>
  (
    JSON.parse(
      readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
    ) as {version: string}
  ).version;

test('@oddsquad/lit-devtools is at the plugin’s version', () => {
  // They release together from one `v*` tag (release.yaml), so a release
  // commit bumps both.
  expect(versionOf('packages/lit-devtools/package.json')).toBe(
    versionOf('package.json')
  );
});
