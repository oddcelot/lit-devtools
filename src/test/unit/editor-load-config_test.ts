/// <reference types="node" />
import {mkdtemp, realpath, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'vite-plus/test';
import {loadLanguageServerConfig} from '../../lib/editor/load-config.js';
import {litPlugin} from '../../lib/plugin.js';

let dir: string;

beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'lit-ls-config-')));
});

afterEach(() => rm(dir, {recursive: true, force: true}));

const write = (name: string, code: string) => writeFile(join(dir, name), code);

/** A Vite config whose only plugin is shaped like litPlugin()'s options plugin. */
const viteConfig = (options: unknown) =>
  `export default {plugins: [[{name: 'lit-plugin-options', api: {options: ${JSON.stringify(options)}}}]]};\n`;

describe('loadLanguageServerConfig', () => {
  test('gives the defaults without any config', async () => {
    expect(await loadLanguageServerConfig(dir)).toEqual({
      scan: ['src'],
      manifests: [],
      ignoreTags: [],
      ignoreAttributes: [],
      entries: [],
      templateTags: ['html', 'svg'],
      diagnostics: {
        'unknown-element': 'warning',
        'unknown-attribute': 'warning',
        'unknown-binding': 'warning',
        'invalid-value': 'warning',
        'missing-import': 'off',
      },
      source: 'default',
      watched: [],
      problems: [],
    });
  });

  test('reads a JSON config file', async () => {
    await write(
      'lit-devtools.config.json',
      JSON.stringify({
        languageServer: {
          scan: ['lib'],
          ignoreTags: ['legacy-*'],
          diagnostics: {'missing-import': 'error'},
        },
      })
    );
    const config = await loadLanguageServerConfig(dir);
    expect(config).toMatchObject({
      scan: ['lib'],
      ignoreTags: ['legacy-*'],
      diagnostics: {'missing-import': 'error', 'unknown-element': 'warning'},
      source: 'file',
      file: join(dir, 'lit-devtools.config.json'),
      watched: [join(dir, 'lit-devtools.config.json')],
      problems: [],
    });
  });

  test.each(['mjs', 'ts'])('reads a .%s config file', async (ext) => {
    await write(
      `lit-devtools.config.${ext}`,
      "export default {languageServer: {templateTags: ['html', 'h']}};\n"
    );
    const config = await loadLanguageServerConfig(dir);
    expect(config).toMatchObject({templateTags: ['html', 'h'], source: 'file'});
  });

  test('reports mistakes and keeps what is valid', async () => {
    await write(
      'lit-devtools.config.json',
      JSON.stringify({
        languageServer: {
          scan: 'src',
          colours: true,
          ignoreTags: ['ok-*'],
          diagnostics: {'unknown-element': 'loud', 'made-up': 'error'},
        },
      })
    );
    const config = await loadLanguageServerConfig(dir);
    const file = join(dir, 'lit-devtools.config.json');
    expect(config.problems).toEqual([
      {file, message: '`scan` should be a list of strings.'},
      {file, message: 'Unknown setting `colours`.'},
      {
        file,
        message:
          '`unknown-element` should be one of error, warning, info, hint, off.',
      },
      {file, message: 'Unknown diagnostic `made-up`.'},
    ]);
    expect(config).toMatchObject({
      scan: ['src'],
      ignoreTags: ['ok-*'],
      diagnostics: {'unknown-element': 'warning'},
    });
  });

  test("reports a config file that doesn't load", async () => {
    await write('lit-devtools.config.json', '{nope');
    const config = await loadLanguageServerConfig(dir);
    expect(config.source).toBe('default');
    expect(config.problems).toMatchObject([
      {
        file: join(dir, 'lit-devtools.config.json'),
        message: expect.stringMatching(/^Couldn't load: /),
      },
    ]);
  });

  test("a Vite config's languageServer wins, and the config file is reported", async () => {
    await write(
      'vite.config.mjs',
      viteConfig({languageServer: {scan: ['from-vite']}})
    );
    await write(
      'lit-devtools.config.json',
      JSON.stringify({languageServer: {scan: ['from-file']}})
    );
    const config = await loadLanguageServerConfig(dir);
    expect(config).toMatchObject({
      scan: ['from-vite'],
      source: 'vite',
      file: join(dir, 'vite.config.mjs'),
      viteConfigFile: join(dir, 'vite.config.mjs'),
      watched: [
        join(dir, 'vite.config.mjs'),
        join(dir, 'lit-devtools.config.json'),
      ],
      problems: [
        {
          file: join(dir, 'lit-devtools.config.json'),
          message:
            'Ignored: vite.config.mjs sets `languageServer`, which takes precedence.',
        },
      ],
    });
  });

  test("uses the config file when the Vite config sets no languageServer, and the manifest's scan", async () => {
    await write('vite.config.mjs', viteConfig({manifest: {scan: ['lib']}}));
    await write(
      'lit-devtools.config.json',
      JSON.stringify({languageServer: {ignoreTags: ['x-*']}})
    );
    const config = await loadLanguageServerConfig(dir);
    expect(config).toMatchObject({
      scan: ['lib'],
      ignoreTags: ['x-*'],
      source: 'file',
      viteConfigFile: join(dir, 'vite.config.mjs'),
      problems: [],
    });
  });

  test("reports a Vite config that doesn't load and falls back", async () => {
    await write('vite.config.mjs', "throw new Error('broken');\n");
    const config = await loadLanguageServerConfig(dir);
    expect(config.source).toBe('default');
    expect(config.problems).toMatchObject([
      {
        file: join(dir, 'vite.config.mjs'),
        message: expect.stringContaining('broken'),
      },
    ]);
  });
});

test('litPlugin() hands its options to whoever loads the Vite config', () => {
  const options = {languageServer: {scan: ['lib']}};
  const plugin = litPlugin(options).find(
    (p) => p.name === 'lit-plugin-options'
  );
  expect((plugin?.api as {options?: unknown} | undefined)?.options).toBe(
    options
  );
});
