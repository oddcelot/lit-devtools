/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vite-plus/test';
import {
  definedNames,
  outputs,
  readTokens,
  resolvedValues,
} from '../../../packages/webawesome-theme-lit/scripts/generate.mjs';

const pkg = new URL('../../../packages/webawesome-theme-lit/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, pkg), 'utf8');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const referenced = (css: string) =>
  new Set(
    [...stripComments(css).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
  );

/** sRGB channels 0–1 of a `#rrggbb` or `hsl(h s% l%)` token value. */
const rgbOf = (value: string): [number, number, number] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const hsl = /^hsl\(([\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(value);
  if (!hsl) throw new Error(`can't read colour ${value}`);
  const [h, s, l] = [+hsl[1], +hsl[2] / 100, +hsl[3] / 100];
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};
const luminance = (value: string) => {
  const [r, g, b] = rgbOf(value).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** HSL hue in degrees. */
const hueOf = (value: string) => {
  const [r, g, b] = rgbOf(value);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h =
    max === r ? (g - b) / d + 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60) % 360;
};

describe('@oddsquad/webawesome-theme-lit', () => {
  const tokens = readTokens();
  const base = definedNames(tokens.base);
  const dark = definedNames(tokens.dark);
  const light = definedNames(tokens.light);

  test('tokens.css and src/lib/design-tokens.ts are what the generator writes', () => {
    for (const {path, text} of outputs()) {
      expect(readFileSync(path, 'utf8'), path).toBe(text);
    }
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

  for (const scheme of ['dark', 'light'] as const) {
    const values = resolvedValues({...tokens, dark: tokens[scheme]});
    const code = [...values.keys()].filter((n) => n.startsWith('--code-'));

    test(`every code colour holds 4.5:1 on the ${scheme} surface`, () => {
      const surface = values.get('--surface')!;
      expect(code.length).toBeGreaterThan(5);
      for (const name of code) {
        expect(
          contrast(values.get(name)!, surface),
          `${name} on --surface`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    test(`${scheme} tag and callee are told apart by hue`, () => {
      // lit-state-row colours an element ref with one and a function with
      // the other; on neighbouring hues the two read as the same type.
      const gap = Math.abs(
        hueOf(values.get('--code-tag')!) - hueOf(values.get('--code-callee')!)
      );
      expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(40);
    });
  }
});
