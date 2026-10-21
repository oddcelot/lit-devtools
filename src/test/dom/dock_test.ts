import {afterEach, describe, expect, test} from 'vite-plus/test';
import {createDock} from '../../lib/runtime/dock.js';

// A real panel URL would make happy-dom fetch it for the iframe.
const PANEL = 'about:blank';

const host = () =>
  document.querySelector<HTMLElement>('[data-lit-devtools-dock]')!;
const frame = () => host().shadowRoot!.querySelector('iframe');
const toggle = () => host().shadowRoot!.querySelector('button')!;

afterEach(() => {
  host()?.remove();
  localStorage.clear();
});

describe('createDock', () => {
  test('starts closed, with no panel loaded', () => {
    createDock(PANEL);
    expect(host().hasAttribute('open')).toBe(false);
    expect(frame()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  test('the button opens the panel and closes it again', () => {
    createDock(PANEL);
    toggle().click();
    expect(host().hasAttribute('open')).toBe(true);
    expect(frame()?.src).toBe(PANEL);
    toggle().click();
    expect(host().hasAttribute('open')).toBe(false);
    // Closing keeps the panel loaded, for a quick reopen.
    expect(frame()).not.toBeNull();
  });

  test('show() follows a link into the panel', () => {
    const dock = createDock(PANEL);
    dock.show();
    dock.show(`${PANEL}#tab=components&component=3`);
    expect(frame()?.src).toBe(`${PANEL}#tab=components&component=3`);
    expect(host().shadowRoot!.querySelectorAll('iframe')).toHaveLength(1);
  });

  test('reopens as it was left', () => {
    createDock(PANEL).show();
    host().remove();

    createDock(PANEL);
    expect(host().hasAttribute('open')).toBe(true);
    expect(frame()?.src).toBe(PANEL);
  });

  test('is not a custom element, so it is never counted as the page’s', () => {
    createDock(PANEL);
    expect(host().localName).toBe('div');
  });
});
