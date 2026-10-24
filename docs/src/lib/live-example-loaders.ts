/**
 * The entry module of each live example the docs bundle (live-examples.ts),
 * as its index.html runs it. Only the demo frame's client script imports
 * this, so no other page takes the examples' CSS. All demo frames share
 * that script, though, so an example that imports a global stylesheet is
 * built with its own config instead (live-examples.ts).
 */
export const liveExampleLoaders: Record<string, () => Promise<unknown>> = {
  flame: () => import('../../../examples/flame/src/lit-flame.ts'),
  forms: () => import('../../../examples/forms/src/main.ts'),
  fernhouse: () => import('../../../examples/fernhouse/src/main.ts'),
  tutorial: () => import('../../../examples/tutorial/src/my-element.ts'),
};
