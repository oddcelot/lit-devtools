import {expect, test, vi} from 'vite-plus/test';

/**
 * `shadowRootPolyfill` in a browser that can't parse declarative shadow
 * roots, which happy-dom can't either when given HTML by `innerHTML`.
 */

const proto = HTMLTemplateElement.prototype as {shadowRootMode?: unknown};

test('attaches the shadow roots before a component defined later connects', async () => {
  const native = Object.getOwnPropertyDescriptor(proto, 'shadowRootMode');
  delete proto.shadowRootMode;
  document.body.innerHTML =
    '<late-card><template shadowrootmode="open"><p>From the server</p></template></late-card>';
  try {
    vi.resetModules();
    await import('../../lib/astro/polyfill.js');
  } finally {
    if (native) Object.defineProperty(proto, 'shadowRootMode', native);
  }

  // The usual pattern: keep a shadow root if there is one, else render.
  customElements.define(
    'late-card',
    class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot === null) {
          this.attachShadow({mode: 'open'}).innerHTML =
            '<p>From the client</p>';
        }
      }
    }
  );
  const card = document.querySelector('late-card')!;
  expect(card.shadowRoot?.innerHTML).toBe('<p>From the server</p>');
  expect(card.querySelector('template')).toBeNull();
});

test('leaves the page alone where the browser parses them itself', async () => {
  const had = 'shadowRootMode' in proto;
  if (!had) proto.shadowRootMode = '';
  document.body.innerHTML =
    '<kept-card><template shadowrootmode="open"><p>x</p></template></kept-card>';
  try {
    vi.resetModules();
    await import('../../lib/astro/polyfill.js');
  } finally {
    if (!had) delete proto.shadowRootMode;
  }
  expect(document.querySelector('kept-card')!.shadowRoot).toBeNull();
});
