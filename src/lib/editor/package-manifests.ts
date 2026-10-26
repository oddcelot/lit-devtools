/**
 * The settings' `manifests`: more Custom Elements Manifests for a package,
 * for components whose package ships none. A path, relative to the package,
 * is read like a dependency's manifest and re-read when it changes; a URL is
 * fetched once, and a fetch that fails is a settings problem.
 */

import path from 'node:path';
import type {ComponentDocs} from '../../types/component-docs.js';
import type {
  ComponentDocsIndex,
  ManifestSource,
} from '../component-docs/load.js';
import {docsFromManifest} from '../component-docs/manifest.js';
import type {ConfigProblem} from './load-config.js';

const URL_RE = /^[a-z][a-z\d+.-]*:/i;

/** The settings' local manifests, as sources the index reads first. */
export const localManifests = (
  dir: string,
  manifests: readonly string[]
): ManifestSource[] =>
  manifests
    .filter((entry) => !URL_RE.test(entry) || /^file:/i.test(entry))
    .map((entry) => {
      const file = /^file:/i.test(entry)
        ? new URL(entry).pathname
        : path.resolve(dir, entry);
      return {path: file, relative: entry};
    });

const FETCH_TIMEOUT_MS = 10_000;

const fetchDocs = async (url: string): Promise<ComponentDocs[]> => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return docsFromManifest(await response.json(), {manifest: url});
};

/**
 * The settings' remote manifests as an index, fetched on first use. A URL
 * that can't be fetched or read adds a problem to `problems`.
 */
export const remoteManifests = (
  manifests: readonly string[],
  problems: ConfigProblem[],
  file: string
): ComponentDocsIndex => {
  const urls = manifests.filter(
    (entry) => URL_RE.test(entry) && !/^file:/i.test(entry)
  );
  let loaded: Promise<ComponentDocs[]> | undefined;
  const load = () =>
    (loaded ??= Promise.all(
      urls.map((url) =>
        fetchDocs(url).catch((error: Error) => {
          problems.push({
            file,
            message: `The manifest ${url} couldn't be read: ${error.message}.`,
          });
          return [];
        })
      )
    ).then((all) => all.flat()));
  return {
    async get(tagName) {
      if (urls.length === 0) return null;
      return (await load()).find((docs) => docs.tagName === tagName) ?? null;
    },
    async tags() {
      if (urls.length === 0) return [];
      return [...new Set((await load()).map((docs) => docs.tagName))];
    },
  };
};

/** Two indexes as one, the first winning. */
export const joinIndexes = (
  first: ComponentDocsIndex,
  second: ComponentDocsIndex
): ComponentDocsIndex => ({
  async get(tagName) {
    return (await first.get(tagName)) ?? (await second.get(tagName));
  },
  async tags() {
    return [...new Set([...(await first.tags()), ...(await second.tags())])];
  },
});
