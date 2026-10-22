/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vite-plus/test';
import {
  definedNames,
  readTokens,
  renderTokensCss,
} from '../../../packages/webawesome-theme-lit/scripts/generate.mjs';

const pkg = new URL('../../../packages/webawesome-theme-lit/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, pkg), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const referenced = (css: string) =>
  new Set(
    [...stripComments(css).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
  );

describe('@oddsquad/webawesome-theme-lit', () => {
  const tokens = readTokens();
  const base = definedNames(tokens.base);
  const dark = definedNames(tokens.dark);
  const light = definedNames(tokens.light);

  test('tokens.css is what the generator writes', () => {
    expect(read('tokens.css')).toBe(renderTokensCss());
  });

  test('dark and light define the same semantic tokens', () => {
    expect([...light].sort()).toEqual([...dark].sort());
  });

  test('every token a token refers to is defined', () => {
    const defined = new Set([...base, ...dark]);
    for (const text of [tokens.base, tokens.dark, tokens.light]) {
      for (const name of referenced(text)) expect(defined).toContain(name);
    }
  });

  test('lit.css maps Web Awesome onto defined tokens only', () => {
    const css = read('src/lit.css');
    const defined = new Set([...base, ...dark]);
    const used = [...referenced(css)].filter((n) => !n.startsWith('--wa-'));
    expect(used.length).toBeGreaterThan(20);
    for (const name of used) expect(defined).toContain(name);
  });

  test('lit.css writes no colour of its own', () => {
    const css = stripComments(read('src/lit.css'));
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)a?\(/i);
  });
});
