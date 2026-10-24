/**
 * Resolves a scanned module's imports without Vite, for projects that have no
 * Vite config: Node's resolution with package `exports`, the conditions and
 * main fields Vite uses for the browser in dev, `.js` specifiers that name a
 * `.ts` source, and the `paths` of the nearest `tsconfig.json`. Workspace
 * links resolve to their real paths, as Vite's do.
 */

import {ResolverFactory} from 'oxc-resolver';
import type {ImportResolver} from './index-module.js';
import {normalizePath} from './paths.js';

export const createNodeResolver = (): ImportResolver => {
  const factory = new ResolverFactory({
    conditionNames: ['import', 'module', 'browser', 'development', 'default'],
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext', 'main'],
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    tsconfig: 'auto',
    builtinModules: true,
  });
  return {
    async resolve(specifier, importer) {
      const result = await factory.resolveFileAsync(importer, specifier);
      if (result.builtin) return {id: specifier, external: true};
      return result.path === undefined
        ? null
        : {id: normalizePath(result.path)};
    },
  };
};
