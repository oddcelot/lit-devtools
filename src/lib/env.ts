/**
 * Env loading and parsing shared by `litPlugin()` and the build-only
 * `litCss()`. Imports nothing dev-only, so the build entry can use it.
 *
 * @module
 */
import {resolve as resolvePath} from 'node:path';
import {loadEnv, type UserConfig} from 'vite';

/** Env var prefix consumed at config time. */
export const ENV_PREFIX = 'LIT_PLUGIN';

/** Parse a boolean-ish env string; `undefined` when unset/unrecognized. */
export const envBool = (v: string | undefined): boolean | undefined =>
  v === 'true' || v === '1'
    ? true
    : v === 'false' || v === '0'
      ? false
      : undefined;

/** Parse a numeric env string; `undefined` when unset/non-numeric. */
export const envNum = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

/**
 * Parse a string against a closed set of values; `undefined` (with a warning)
 * when set to something outside it, so a typo falls back to the default
 * instead of silently disabling a feature.
 */
export const envEnum = <T extends string>(
  v: string | undefined,
  allowed: readonly T[],
  source: string
): T | undefined => {
  if (v === undefined || v === '') return undefined;
  if ((allowed as readonly string[]).includes(v)) return v as T;
  console.warn(
    `[lit-plugin] ignoring ${source}=${JSON.stringify(v)}; expected one of ` +
      allowed.map((a) => JSON.stringify(a)).join(', ')
  );
  return undefined;
};

/**
 * The `LIT_PLUGIN_*` env for a `config` hook: `.env*` files from the env dir
 * (root by default) merged with matching `process.env` keys. Explicit options
 * still win; resolving them is the caller's job.
 */
export const loadPluginEnv = (
  viteConfig: UserConfig,
  mode: string
): Record<string, string> => {
  const envDir = viteConfig.envDir
    ? resolvePath(viteConfig.envDir)
    : viteConfig.root
      ? resolvePath(viteConfig.root)
      : process.cwd();
  return loadEnv(mode, envDir, ENV_PREFIX);
};
