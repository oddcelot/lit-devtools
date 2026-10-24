import type {HtmlTagDescriptor, Plugin} from 'vite';
import {MANIFEST_LINK_REL} from '../component-docs/linked.js';
import {findManifests, nodeDocsFs} from '../component-docs/load.js';
import type {OptionsContext} from './context.js';
import {endpointUrl} from './manifest.js';

/**
 * The URL the dev server serves `file` under: a path from `base` for a file
 * inside `root`, else Vite's `/@fs/` prefix (which `server.fs.allow` still
 * guards). Both paths absolute; separators may be either kind.
 */
export const devServerUrl = (
  file: string,
  root: string,
  base: string
): string => {
  const path = file.replace(/\\/g, '/');
  const dir = root.replace(/\\/g, '/').replace(/\/$/, '');
  const prefix = base.endsWith('/') ? base : `${base}/`;
  if (path.startsWith(`${dir}/`)) return prefix + path.slice(dir.length + 1);
  return `${prefix}@fs${path.startsWith('/') ? '' : '/'}${path}`;
};

/**
 * Names the Custom Elements Manifests the project can see, its own and its
 * dependencies', in each dev page's head as
 * `<link rel="custom-elements-manifest">`. The browser extension reads these
 * to show component docs on a page with no Node host behind its panel; the
 * Vite panel reads the same files from disk and needs no links.
 */
export const litManifestLinks = (ctx: OptionsContext): Plugin => {
  let root = process.cwd();
  let base = '/';
  return {
    name: 'lit-manifest-links',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    async transformIndexHtml(): Promise<HtmlTagDescriptor[]> {
      const {timeline, manifest} = ctx.get();
      if (!timeline) return [];
      const fs = await nodeDocsFs();
      // The dev server's own manifest links itself; a copy `write` keeps at
      // the same URL would be the same document twice.
      const served =
        manifest !== false && manifest.dev !== false
          ? endpointUrl(base, manifest.dev)
          : undefined;
      return findManifests(fs, root).flatMap((found) => {
        const href = devServerUrl(found.path, root, base);
        return href === served
          ? []
          : [
              {
                tag: 'link',
                attrs: {rel: MANIFEST_LINK_REL, href},
                injectTo: 'head' as const,
              },
            ];
      });
    },
  };
};
