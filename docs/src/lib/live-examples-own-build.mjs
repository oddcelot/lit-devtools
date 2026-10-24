/**
 * The live demos src/lib/live-examples.ts marks `{build: 'own-config'}`,
 * built with the example's own vite.config.ts (scripts/build-live-example.mjs)
 * and placed next to their demo page, under `_live/`.
 *
 * Their styles come from build plugins of their own: UnoCSS writing a file
 * the components import, Tailwind, Lightning CSS with old targets. In the
 * docs' Vite config those would run over every page of the site, and
 * Lightning CSS cannot be scoped to some files at all. Built apart, each
 * example builds as it does on its own, from a clean checkout too: UnoCSS
 * writes its file in the build's first step, as it does there.
 *
 * The docs build writes each one into dist/. The dev server builds each
 * once, on the first request for it, and serves the files.
 */
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile, rm} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const SCRIPT = fileURLToPath(
  new URL('../../scripts/build-live-example.mjs', import.meta.url)
);
const CACHE = fileURLToPath(
  new URL('../../node_modules/.cache/live-examples/', import.meta.url)
);
const OWN_BUILD_URL =
  /^\/live-panel\/examples\/([\w-]+)\/demo\/(_live\/[^?#]+)/;
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

const buildExample = async (name, outDir) => {
  const {stderr} = await promisify(execFile)(
    process.execPath,
    [SCRIPT, name, outDir],
    {maxBuffer: 16 * 1024 * 1024}
  );
  if (stderr.trim()) console.warn(stderr.trimEnd());
};

/** @param {string[]} names the examples built with their own config */
export const liveExamplesOwnBuild = (names) => {
  const devBuilds = new Map();
  const devBuild = (name) => {
    if (!devBuilds.has(name)) {
      const out = join(CACHE, name);
      devBuilds.set(
        name,
        rm(out, {recursive: true, force: true})
          .then(() => buildExample(name, out))
          .then(() => out)
      );
    }
    return devBuilds.get(name);
  };
  return {
    name: 'live-examples-own-build',
    hooks: {
      'astro:server:setup': ({server}) => {
        server.middlewares.use((req, res, next) => {
          const [, name, file] = req.url?.match(OWN_BUILD_URL) ?? [];
          if (
            name === undefined ||
            !names.includes(name) ||
            decodeURIComponent(file).includes('..')
          ) {
            next();
            return;
          }
          devBuild(name)
            .then((out) => readFile(join(out, file)))
            .then((body) => {
              res.setHeader(
                'Content-Type',
                TYPES[extname(file)] ?? 'application/octet-stream'
              );
              res.end(body);
            })
            .catch(next);
        });
      },
      'astro:build:done': async ({dir, logger}) => {
        for (const name of names) {
          const out = fileURLToPath(
            new URL(`live-panel/examples/${name}/demo/`, dir)
          );
          if (!existsSync(out)) continue;
          logger.info(`examples/${name}, with its own vite.config.ts`);
          await buildExample(name, out);
        }
      },
    },
  };
};
