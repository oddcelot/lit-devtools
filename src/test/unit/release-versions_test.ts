/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {expect, test} from 'vite-plus/test';

const versionOf = (path: string): string =>
  (
    JSON.parse(
      readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
    ) as {version: string}
  ).version;

test('the packages that release together are at the plugin’s version', () => {
  // One `v*` tag publishes them all (release.yaml), so a release commit
  // bumps all four.
  for (const pkg of [
    'packages/lit-devtools',
    'packages/lit-language-server',
    'packages/oxlint-plugin-lit',
  ]) {
    expect(`${pkg} ${versionOf(`${pkg}/package.json`)}`).toBe(
      `${pkg} ${versionOf('package.json')}`
    );
  }
});
