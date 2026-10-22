import {describe, expect, test} from 'vite-plus/test';
import {tokenStyleText} from '../../lib/tokens.js';

/**
 * The token stylesheet is injected into two very different documents: the
 * host page (indicator, source-overlay) and the panel's own document. Setting
 * `color-scheme` on the HOST page's `:root` makes the UA repaint the canvas
 * dark for apps that never declare an opaque background — a real regression
 * observed in embedding apps. Host-page injection must therefore ship custom
 * properties only; the panel opts into `color-scheme` for its own document.
 */
describe('tokenStyleText', () => {
  test('default (host page) carries no color-scheme declaration', () => {
    const text = tokenStyleText();
    // `prefers-color-scheme` (the media feature) is expected; the property
    // declaration is not.
    expect(text).not.toMatch(/(?<!prefers-)color-scheme\s*:/);
  });

  test('default still defines the semantic token custom properties', () => {
    const text = tokenStyleText();
    expect(text).toContain('--lit-devtools-bg:');
    expect(text).toContain('--lit-devtools-accent:');
    expect(text).toContain('@media (prefers-color-scheme: light)');
    expect(text).toContain(':root.color-scheme-light');
    expect(text).toContain(':root.color-scheme-dark');
  });

  test('colorScheme: true (panel document) declares both schemes', () => {
    const text = tokenStyleText({colorScheme: true});
    expect(text).toContain('color-scheme: dark;');
    expect(text).toContain('color-scheme: light;');
  });

  test('a scope confines the tokens to that element', () => {
    const text = tokenStyleText({scope: '.lit-devtools-root'});
    expect(text).not.toContain(':root {');
    expect(text).toMatch(/^\s*\.lit-devtools-root \{/);
    // The page's own scheme switch reaches the scoped element.
    expect(text).toContain(":root[data-theme='dark'] .lit-devtools-root");
    expect(text).toContain(':root.color-scheme-light .lit-devtools-root');
  });

  test('Web Awesome density only on request', () => {
    expect(tokenStyleText()).not.toContain('--wa-');
    const text = tokenStyleText({webAwesome: true});
    expect(text).toContain('--wa-font-size-scale: 0.8125;');
    expect(text).toContain(
      '--wa-form-control-height: var(--lit-devtools-control-height);'
    );
  });
});
