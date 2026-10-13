import type {Plugin} from 'vite';

/** The hooks a lazy plugin can forward. Vite awaits every one of them. */
const FORWARDED_HOOKS = [
  'config',
  'configResolved',
  'configureServer',
  'resolveId',
  'load',
  'transform',
  'transformIndexHtml',
  'watchChange',
] as const;

type ForwardedHook = (typeof FORWARDED_HOOKS)[number];
type Order = 'pre' | 'post';

/** Keys of the real plugin that aren't hooks the shell forwards. */
const META_KEYS = new Set(['name', 'apply', 'enforce', 'devtools']);

/** A `devtools` hook as `@vitejs/devtools` reads it off a plugin. */
interface DevtoolsHook {
  capabilities?: unknown;
  setup: (ctx: never) => unknown;
}

/**
 * What Vite needs to know about a plugin before its code is loaded: the
 * fields it reads while sorting and filtering plugins, and which hooks exist
 * (an `order` changes where a hook runs, so it can't be filled in later).
 */
export interface LazyPluginShape {
  name: string;
  enforce?: Order;
  /** Every hook the real plugin defines, with its `order` if it sets one. */
  hooks: Partial<Record<ForwardedHook, {order?: Order}>>;
  /** The real plugin's `devtools.capabilities`, when it has a devtools hook. */
  devtools?: {capabilities: unknown};
}

type AnyHook = (this: unknown, ...args: unknown[]) => unknown;

/** A plugin read as a bag of hooks, keyed by name. */
const hookOf = (plugin: Plugin, name: string): unknown =>
  (plugin as unknown as Record<string, unknown>)[name];

const handlerOf = (hook: unknown): AnyHook | undefined =>
  typeof hook === 'function'
    ? (hook as AnyHook)
    : (hook as {handler?: AnyHook} | undefined)?.handler;

const orderOf = (hook: unknown): Order | undefined =>
  typeof hook === 'object' && hook !== null
    ? (hook as {order?: Order}).order
    : undefined;

/**
 * Throws when the real plugin no longer matches its declared shape: a hook the
 * shell doesn't forward would otherwise never run, without any error.
 */
const assertShape = (shape: LazyPluginShape, real: Plugin): void => {
  const fail = (what: string) => {
    throw new Error(
      `[lit-plugin] lazy plugin ${shape.name}: ${what}; update its shape in plugin.ts`
    );
  };
  if (real.name !== shape.name) fail(`real plugin is named ${real.name}`);
  if (real.enforce !== shape.enforce) fail(`enforce is ${real.enforce}`);
  if ('devtools' in real !== (shape.devtools !== undefined)) {
    fail('devtools hook mismatch');
  }
  for (const key of Object.keys(real)) {
    if (META_KEYS.has(key)) continue;
    if (!(key in shape.hooks)) fail(`hook ${key} is not declared`);
  }
  for (const [hook, {order} = {}] of Object.entries(shape.hooks)) {
    const defined = hookOf(real, hook);
    if (defined === undefined) fail(`declared hook ${hook} is missing`);
    if (orderOf(defined) !== order) fail(`hook ${hook} has a different order`);
  }
};

/**
 * A serve-only plugin whose code is imported only when the dev server starts.
 * Vite drops `apply: 'serve'` plugins before it calls any hook of a build, so
 * under `vite build` `load` never runs and the real plugin, with everything it
 * imports, never enters the build process.
 *
 * The shell loads the real plugin in `config`, the first hook Vite calls, and
 * forwards each declared hook to it. A hook called before `config` (unit
 * tests do) loads it first.
 */
export const lazyServePlugin = (
  shape: LazyPluginShape,
  load: () => Promise<Plugin>
): Plugin => {
  let real: Plugin | undefined;
  let loading: Promise<Plugin> | undefined;
  const get = () =>
    (loading ??= load().then((plugin) => {
      assertShape(shape, plugin);
      return (real = plugin);
    }));

  const forward = (hook: ForwardedHook): AnyHook =>
    function (this: unknown, ...args: unknown[]) {
      const run = (plugin: Plugin) =>
        handlerOf(hookOf(plugin, hook))?.apply(this, args);
      return real ? run(real) : get().then(run);
    };

  const shell: Record<string, unknown> = {
    name: shape.name,
    apply: 'serve',
    ...(shape.enforce && {enforce: shape.enforce}),
    // Always present, so the real plugin loads as soon as the server starts.
    config: forward('config'),
  };
  for (const hook of FORWARDED_HOOKS) {
    const declared = shape.hooks[hook];
    if (declared === undefined) continue;
    const handler = forward(hook);
    shell[hook] = declared.order ? {order: declared.order, handler} : handler;
  }
  if (shape.devtools) {
    shell.devtools = {
      capabilities: shape.devtools.capabilities,
      setup: async (ctx: never) =>
        ((await get()) as {devtools: DevtoolsHook}).devtools.setup(ctx),
    };
  }
  return shell as unknown as Plugin;
};
