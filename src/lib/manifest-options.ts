/**
 * Where the Custom Elements Manifest written from the project's own sources
 * goes. Each output is optional and named by its option; `manifest: true`
 * turns on the build asset and the dev endpoint, the two that touch no file
 * of the project's.
 */

export interface ManifestOptions {
  /**
   * `vite build` emits the manifest as an asset beside the bundle. A string
   * names the file, relative to `build.outDir`. Defaults to
   * `custom-elements.json`.
   */
  build?: boolean | string;

  /**
   * The dev server serves the manifest at this path, kept current as
   * modules change, and links it in each page's head as
   * `<link rel="custom-elements-manifest">`. It lists the scripts under
   * `scan` and every module the dev server transforms. Defaults to
   * `/custom-elements.json`.
   */
  dev?: boolean | string;

  /**
   * Keep a manifest file in the project, rewritten by the dev server as
   * modules change and by `vite build` once it has read every module. A
   * string names the file, relative to Vite's root. When the root's
   * `package.json` has no `customElements` field, it is set to point at the
   * file. Defaults to `false`; `true` writes `custom-elements.json`.
   */
  write?: boolean | string;

  /**
   * Folders, relative to Vite's root, whose scripts the dev server reads when
   * it starts and follows as they change, so its manifest (`dev`, `write`)
   * lists components no page has loaded yet. `false` lists only the modules
   * pages load. Defaults to `['src']`.
   */
  scan?: false | string[];
}

/** Each output's file or path, or `false` when it is off. */
export interface ResolvedManifest {
  build: string | false;
  dev: string | false;
  write: string | false;
  /** Folders the dev server reads up front; empty for none. */
  scan: string[];
}

const FILE = 'custom-elements.json';

const output = (
  value: boolean | string | undefined,
  fallback: string | false,
  named: string
): string | false => {
  if (value === undefined) return fallback;
  if (value === false) return false;
  return value === true || value.trim() === '' ? named : value;
};

/** `false` unless the project asked for a manifest. */
export const resolveManifest = (
  option: boolean | ManifestOptions | undefined
): ResolvedManifest | false => {
  if (option === undefined || option === false) return false;
  const options = option === true ? {} : option;
  const dev = output(options.dev, `/${FILE}`, `/${FILE}`);
  return {
    build: output(options.build, FILE, FILE),
    dev: dev === false || dev.startsWith('/') ? dev : `/${dev}`,
    write: output(options.write, false, FILE),
    scan: options.scan === false ? [] : (options.scan ?? ['src']),
  };
};
