import {afterEach, describe, expect, test, vi} from 'vite-plus/test';
import {createDock} from '../../lib/runtime/dock.js';

// A real panel URL would make happy-dom fetch it for the iframe.
const PANEL = 'about:blank';
// What the dock loads: the panel, told that its hash is read.
const DOCKED = `${PANEL}?dock`;

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
    expect(frame()?.src).toBe(DOCKED);
    toggle().click();
    expect(host().hasAttribute('open')).toBe(false);
    // Closing keeps the panel loaded, for a quick reopen.
    expect(frame()).not.toBeNull();
  });

  test('show() follows a link into the panel', () => {
    const dock = createDock(PANEL);
    dock.show();
    dock.show(`${PANEL}#tab=components&component=3`);
    expect(frame()?.src).toBe(`${DOCKED}#tab=components&component=3`);
    expect(host().shadowRoot!.querySelectorAll('iframe')).toHaveLength(1);
  });

  test('reopens as it was left', () => {
    createDock(PANEL).show();
    host().remove();

    createDock(PANEL);
    expect(host().hasAttribute('open')).toBe(true);
    expect(frame()?.src).toBe(DOCKED);
  });

  test('keeps the panel’s tab across a page load, but not its selection', () => {
    createDock(PANEL).show();
    frame()!.contentWindow!.location.hash = '#tab=timeline&component=3';
    dispatchEvent(new Event('pagehide'));
    host().remove();

    createDock(PANEL);
    expect(frame()?.src).toBe(`${DOCKED}#tab=timeline`);
  });

  test('asks for the code in place of the panel, and loads the panel after', async () => {
    const dock = createDock(PANEL);
    const submit = vi.fn(async (code: string) => code === '123456');
    const reissue = vi.fn(async () => {});
    dock.askForCode({submit, reissue});
    toggle().click();

    expect(host().hasAttribute('needs-code')).toBe(true);
    expect(frame()).toBeNull();

    const shadow = host().shadowRoot!;
    const input = shadow.querySelector<HTMLInputElement>('input[name=code]')!;
    const form = shadow.querySelector('form')!;
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    input.value = '000000';
    form.requestSubmit();
    await settle();
    expect(shadow.querySelector('[role=alert]')!.textContent).toMatch(
      /did not work/
    );
    expect(host().hasAttribute('needs-code')).toBe(true);

    shadow.querySelector<HTMLButtonElement>('.link')!.click();
    await settle();
    expect(reissue).toHaveBeenCalledOnce();

    input.value = '123456';
    form.requestSubmit();
    await settle();
    expect(host().hasAttribute('needs-code')).toBe(false);
    expect(frame()?.src).toBe(DOCKED);
  });

  test('is not a custom element, so it is never counted as the page’s', () => {
    createDock(PANEL);
    expect(host().localName).toBe('div');
  });
});
