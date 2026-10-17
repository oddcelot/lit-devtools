import {describe, expect, test} from 'vite-plus/test';
import {litNodeBuilds, nodeBuildOf} from '../../lib/astro/node-builds.js';

describe('nodeBuildOf', () => {
  test("puts the browser build's file under node/, keeping its flavour", () => {
    expect(nodeBuildOf('/p/node_modules/lit-html/lit-html.js')).toBe(
      '/p/node_modules/lit-html/node/lit-html.js'
    );
    expect(
      nodeBuildOf(
        '/p/node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/development/decorators/property.js'
      )
    ).toBe(
      '/p/node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/development/decorators/property.js'
    );
  });

  test('leaves node builds and other packages alone', () => {
    for (const file of [
      '/p/node_modules/lit-html/node/lit-html.js',
      '/p/node_modules/lit-element/lit-element.js',
      '/p/src/lit-html/x.js',
    ]) {
      expect(nodeBuildOf(file)).toBe(file);
    }
  });
});

describe('litNodeBuilds', () => {
  const plugin = litNodeBuilds();
  const environment = (consumer: string, conditions: string[]) =>
    ({config: {consumer, resolve: {conditions}}}) as never;

  test('applies only to a server environment that resolves without node', () => {
    const applies = plugin.applyToEnvironment as (env: never) => boolean;
    expect(applies(environment('server', ['workerd', 'worker']))).toBe(true);
    expect(applies(environment('server', ['node', 'development']))).toBe(false);
    expect(applies(environment('client', ['browser']))).toBe(false);
  });

  test('resolves lit-html and @lit/reactive-element to their node builds', async () => {
    const resolveId = plugin.resolveId as unknown as (
      this: unknown,
      id: string,
      importer: string | undefined,
      options: object
    ) => Promise<{id: string} | null>;
    const context = {
      resolve: async (id: string) => ({
        id: `/p/node_modules/${id}/development/${id.split('/').pop()}.js`,
      }),
    };
    expect(
      await resolveId.call(context, 'lit-html', '/p/src/a.ts', {})
    ).toEqual({id: '/p/node_modules/lit-html/node/development/lit-html.js'});
    expect(
      (await resolveId.call(context, '@lit/reactive-element', undefined, {}))
        ?.id
    ).toBe(
      '/p/node_modules/@lit/reactive-element/node/development/reactive-element.js'
    );
    expect(await resolveId.call(context, 'lit', '/p/src/a.ts', {})).toBeNull();
  });
});
