import {expect, test} from 'vite-plus/test';
import {resolveManifest} from '../../lib/manifest-options.js';

test('off unless asked for', () => {
  expect(resolveManifest(undefined)).toBe(false);
  expect(resolveManifest(false)).toBe(false);
});

test('true turns on the build asset and the dev endpoint', () => {
  expect(resolveManifest(true)).toEqual({
    build: 'custom-elements.json',
    dev: '/custom-elements.json',
    write: false,
  });
});

test('each output can be named or switched off', () => {
  expect(
    resolveManifest({build: false, dev: 'api/elements.json', write: true})
  ).toEqual({
    build: false,
    dev: '/api/elements.json',
    write: 'custom-elements.json',
  });
  expect(resolveManifest({dev: false, write: 'docs/x.json'})).toEqual({
    build: 'custom-elements.json',
    dev: false,
    write: 'docs/x.json',
  });
});

test('an empty name falls back to the default one', () => {
  expect(resolveManifest({build: ' ', write: ''})).toMatchObject({
    build: 'custom-elements.json',
    write: 'custom-elements.json',
  });
});
