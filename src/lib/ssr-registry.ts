/**
 * Lets a dev server's SSR renders pick up an edited component.
 *
 * Vite re-runs an edited module for the next server render, and the module
 * calls `customElements.define` again for a tag the server already knows.
 * In Node that registry is `@lit-labs/ssr-dom-shim`'s, which only lets the
 * second definition through with a warning when `NODE_ENV` is
 * `development`, and throws under any other value (a test runner's `test`,
 * or none at all in a custom server), which fails every render after the
 * first edit. Here a repeat definition replaces the old one, quietly, so the
 * server renders the new class.
 *
 * Lit's node build installs the shim as `globalThis.customElements ??=
 * shim`, so the registry is wrapped when it is set, or at once if it already
 * is. Dev server only: production keeps the shim's strictness.
 */

const WRAPPED = Symbol.for('@oddsquad/vite-plugin-lit#ssr-redefine');

interface Registry {
  define: (
    this: Registry,
    name: string,
    ctor: unknown,
    options?: unknown
  ) => void;
  get: (this: Registry, name: string) => unknown;
  /** The shim's own bookkeeping; absent from any other registry. */
  __definitions?: Map<string, {ctor: unknown}>;
  __reverseDefinitions?: Map<unknown, string>;
  [WRAPPED]?: true;
}

/** Drops `name` from the shim's maps, so defining it again is a first time. */
const forget = (registry: Registry, name: string): boolean => {
  const definitions = registry.__definitions;
  const reverse = registry.__reverseDefinitions;
  if (!(definitions instanceof Map) || !(reverse instanceof Map)) return false;
  reverse.delete(definitions.get(name)?.ctor);
  definitions.delete(name);
  return true;
};

const wrap = (registry: unknown): void => {
  const r = registry as Registry | null | undefined;
  if (r === null || typeof r !== 'object' || r[WRAPPED] === true) return;
  if (typeof r.define !== 'function' || typeof r.get !== 'function') return;
  const define = r.define;
  r.define = function (this: Registry, name, ctor, options) {
    if (this.get(name) !== undefined) forget(this, name);
    return define.call(this, name, ctor, options);
  };
  r[WRAPPED] = true;
};

/** Wrap the server's custom element registry, now or when Lit installs it. */
export const allowServerRedefinition = (): void => {
  const global = globalThis as {customElements?: unknown};
  // A real one means a DOM environment (a browser-like test runner), where
  // the page's own HMR handles redefinition.
  if (typeof (globalThis as {window?: unknown}).window !== 'undefined') return;
  if (global.customElements !== undefined) {
    wrap(global.customElements);
    return;
  }
  let current: unknown;
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    enumerable: true,
    get: () => current,
    set: (value: unknown) => {
      wrap(value);
      current = value;
    },
  });
};
