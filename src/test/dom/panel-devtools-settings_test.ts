import {afterEach, beforeAll, describe, expect, test, vi} from 'vite-plus/test';
import type {DevtoolsSettings} from '../../panel/devtools-settings.js';
import {calls, meta, resetClient} from './fakes/client.js';
import {overrides} from '../../panel/settings-override.js';
import {resolveOptions, toFeatureSettings} from '../../lib/options.js';
import {
  useManifestSetting,
  type ManifestSetting,
  type ManifestState,
} from '../../panel/manifest-setting.js';

vi.mock('../../panel/client.js', () => import('./fakes/client.js'));

beforeAll(async () => {
  await import('../../panel/devtools-settings.js');
});

afterEach(() => {
  document.body.replaceChildren();
  resetClient();
});

const mount = async () => {
  const el = document.createElement('devtools-settings') as DevtoolsSettings;
  document.body.append(el);
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
  }
  return el.shadowRoot!;
};

const about = async () => {
  const el = document.createElement('devtools-settings') as DevtoolsSettings;
  document.body.append(el);
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
  }
  const section = [...el.shadowRoot!.querySelectorAll('section')].find(
    (s) => s.querySelector('h3')?.textContent?.trim() === 'About'
  );
  return section?.textContent?.replace(/\s+/g, ' ');
};

test('About lists the plugin version, Lit package versions and precedence', async () => {
  const text = await about();
  expect(text).toContain('9.9.9');
  expect(text).toContain('lit-html 3.3.3');
  expect(text).toContain('lit-element 4.2.2');
  expect(text).toContain('unavailable (enable sourceOverlay)');
  expect(text).toContain('panel override, then plugin option, then default');
  expect(text).not.toContain('LIT_PLUGIN_');
});

test('About flags duplicate lit copies', async () => {
  meta.runtime = {
    ready: true,
    litPackages: {'lit-element': ['4.2.2', '4.1.0']},
    topFrame: true,
    chromeTracks: true,
  };
  expect(await about()).toContain(
    'lit-element 4.2.2, 4.1.0 (duplicate copies)'
  );
});

test('the color scheme wa-select writes the choice through the settings store', async () => {
  const el = document.createElement('devtools-settings') as DevtoolsSettings;
  document.body.append(el);
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await el.updateComplete;
  }
  const select = el.shadowRoot!.querySelector('wa-select') as HTMLElement & {
    value: string;
  };
  expect(
    [...select.querySelectorAll('wa-option')].map((o) =>
      o.getAttribute('value')
    )
  ).toEqual(['auto', 'dark', 'light']);
  select.value = 'light';
  select.dispatchEvent(new Event('change'));
  await el.updateComplete;
  expect(overrides.appearance()).toBe('light');
});

test('About says lit was not detected before a runtime connects', async () => {
  meta.runtime = {
    ready: false,
    litPackages: {},
    topFrame: true,
    chromeTracks: true,
  };
  expect(await about()).toContain('not detected');
});

test('origin badges skip defaults, and the open select marks the baseline', async () => {
  meta.features = toFeatureSettings(
    resolveOptions(
      {sourceOverlay: true},
      {LIT_PLUGIN_HMR_ON_INCOMPATIBLE: 'warn'}
    )
  );
  const root = await mount();
  const row = (key: string) =>
    [...root.querySelectorAll('tr')].find(
      (tr) => tr.querySelector('.key')?.textContent?.trim() === key
    )!;

  // childState is a built-in default: no badge, but the option says so.
  const child = row('child state');
  expect(child.querySelector('.src')).toBeNull();
  const marked = child.querySelector('wa-option .opt-src')!;
  expect(marked.closest('wa-option')!.getAttribute('value')).toBe('transfer');
  expect(marked.textContent).toBe('default');

  // onIncompatible came from env: the badge stays and the marker names env.
  const incompatible = row('on incompatible');
  expect(incompatible.querySelector('.src')?.textContent).toBe('(env)');
  // ...and the built-in default keeps its own marker beside it.
  const markers = Object.fromEntries(
    [...incompatible.querySelectorAll('wa-option .opt-src')].map((m) => [
      m.closest('wa-option')!.getAttribute('value'),
      m.textContent,
    ])
  );
  expect(markers).toEqual({warn: 'env', reload: 'default'});

  expect(child.querySelector('.key')!.getAttribute('data-tip')).toContain(
    'Default: transfer'
  );
});

test('the chrome tracks row links to the guide on where the tracks appear', async () => {
  meta.features = toFeatureSettings(resolveOptions({timeline: true}, {}));
  const root = await mount();
  const link = root.querySelector('wa-button.docs-link')!;
  expect(link.getAttribute('href')).toMatch(
    /\/guides\/devtools\/timeline\/#see-it-in-chromes-performance-panel$/
  );
  expect(link.getAttribute('target')).toBe('_blank');
});

test('without custom tracks, the docs link points at the Firefox section', async () => {
  meta.capabilities.pluginSettings = false;
  meta.runtime = {...meta.runtime, ready: true, chromeTracks: false};
  const link = (await mount()).querySelector('wa-button.docs-link')!;
  expect(link.getAttribute('href')).toMatch(
    /\/guides\/devtools\/timeline\/#in-firefox-and-older-chrome$/
  );
  expect(link.getAttribute('data-tip')).toContain('Firefox Profiler');
  expect(link.getAttribute('data-tip')).not.toContain('in Chrome');
});

test('explains missing plugin settings off the Vite plugin', async () => {
  meta.capabilities.pluginSettings = false;
  const text = (await mount()).querySelector('.empty')!.textContent!.trim();
  expect(text).toBe(
    'Plugin settings need the Vite plugin; this page is inspected without a Vite dev server.'
  );
});

test('keeps the plain message when the plugin simply sent no settings', async () => {
  const root = await mount();
  expect(root.querySelector('.empty')!.textContent!.trim()).toBe(
    'Settings unavailable.'
  );
  expect(root.querySelector('wa-switch')).toBeNull();
});

test('off the Vite plugin, the page-side preferences still switch on', async () => {
  meta.capabilities.pluginSettings = false;
  const root = await mount();
  const row = (key: string) =>
    [...root.querySelectorAll('tr')].find(
      (tr) => tr.querySelector('.key')?.textContent?.trim() === key
    );
  expect(row('flash updates')).toBeDefined();
  const tracks = row('performance tracks')!.querySelector('wa-switch')!;
  tracks.checked = true;
  tracks.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(
    calls
      .filter((c) => c.name === 'set-settings-override')
      .map((c) => c.args[0])
  ).toContainEqual(expect.objectContaining({chromeTracks: true}));
});

test('a feature header says where the feature was switched, and how to turn it on', async () => {
  meta.features = toFeatureSettings(
    resolveOptions({hmr: false}, {LIT_PLUGIN_TIMELINE: 'true'})
  );
  const root = await mount();
  const card = (title: string) =>
    [...root.querySelectorAll('wa-card')].find((c) =>
      c.querySelector('h3')?.textContent?.trim().startsWith(title)
    )!;
  const badge = (title: string) =>
    card(title).querySelector('h3 .src')?.textContent ?? null;

  expect(badge('HMR')).toBe('(option)');
  expect(badge('Timeline')).toBe('(env)');
  // Off by default: nothing to attribute.
  expect(badge('Source Overlay')).toBeNull();

  const hint = (title: string) =>
    card(title)
      .querySelector('.empty')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim();
  expect(hint('HMR')).toBe('Enable with hmr: true.');
  expect(hint('Source Overlay')).toBe('Enable with sourceOverlay: true.');
});

test('without custom tracks, the row says the entries go to User Timing', async () => {
  meta.capabilities.pluginSettings = false;
  const note = async () =>
    [...(await mount()).querySelectorAll('p.note')]
      .map((p) => p.textContent!.replace(/\s+/g, ' '))
      .find((t) => t.includes('User Timing'));

  expect(await note()).toBeUndefined();
  document.body.replaceChildren();
  meta.runtime = {...meta.runtime, ready: true, chromeTracks: false};
  expect(await note()).toContain('lit: marks and measures');
});

describe('Component docs', () => {
  const site = 'https://webawesome.com';
  const docsSection = (root: ShadowRoot) =>
    [...root.querySelectorAll('section')].find(
      (s) => s.querySelector('h3')?.textContent?.trim() === 'Component docs'
    );
  const empty: ManifestState = {site, entries: [], found: [], ignored: []};

  /** A host setting whose state the test drives, and what it was asked. */
  const fakeSetting = (state: ManifestState) => {
    const listeners = new Set<() => void>();
    const asked: string[] = [];
    let current = state;
    const setting: ManifestSetting = {
      state: () => current,
      add: async (input) => {
        asked.push(`add:${input}`);
        return input.startsWith('https://elsewhere')
          ? `Must be on ${site}`
          : undefined;
      },
      remove: async (url) => void asked.push(`remove:${url}`),
      allow: async (url) => {
        asked.push(`allow:${url}`);
        return 'Access to cdn.example was not granted';
      },
      toggle: async (url, on) => void asked.push(`toggle:${url}:${on}`),
      move: async (url, by) => void asked.push(`move:${url}:${by}`),
      use: async (url) => void asked.push(`use:${url}`),
      ignore: async (url) => void asked.push(`ignore:${url}`),
      reset: async (url) => void asked.push(`reset:${url}`),
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
    const update = (next: ManifestState) => {
      current = next;
      for (const l of listeners) l();
    };
    return {setting, asked, update};
  };

  const buttons = (el: Element) =>
    [...el.querySelectorAll('wa-button')].map(
      (b) => [b.textContent!.trim(), b as HTMLElement] as const
    );

  afterEach(() => useManifestSetting(undefined));

  test('is absent when the host has no manifest setting', async () => {
    expect(docsSection(await mount())).toBeUndefined();
  });

  test('lists the manifests in order, marks the linked one, and acts on each', async () => {
    const {setting, asked} = fakeSetting({
      ...empty,
      entries: [
        {url: `${site}/linked.json`, enabled: true, linked: true},
        {url: `${site}/a.json`, enabled: false, linked: false},
      ],
    });
    useManifestSetting(setting);
    const section = docsSection(await mount())!;
    const rows = [...section.querySelectorAll('.manifest-row')];
    // The site's own URLs read back as their paths.
    expect(rows.map((r) => r.querySelector('code')!.textContent)).toEqual([
      '/linked.json',
      '/a.json',
    ]);
    expect(section.textContent).toContain('Read in this order');
    const [linked, mine] = rows as [Element, Element];
    expect(linked.querySelector('wa-badge')?.textContent).toContain(
      'linked by page'
    );
    expect(mine.querySelector('wa-badge')).toBeNull();
    const switches = rows.map(
      (r) => r.querySelector('wa-switch') as HTMLElement & {checked: boolean}
    );
    expect(switches.map((sw) => sw.checked)).toEqual([true, false]);

    // A link moves and switches but has no Remove; the ends can't move out.
    const labels = (row: Element) =>
      buttons(row).map(
        ([text, b]) => text || b.querySelector('wa-icon')!.getAttribute('label')
      );
    expect(labels(linked)).toEqual([
      'Move /linked.json up',
      'Move /linked.json down',
    ]);
    expect(labels(mine)).toEqual([
      'Move /a.json up',
      'Move /a.json down',
      'Remove',
    ]);
    expect(buttons(linked).map(([, b]) => b.hasAttribute('disabled'))).toEqual([
      true,
      false,
    ]);

    switches[1]!.checked = true;
    switches[1]!.dispatchEvent(new Event('change'));
    buttons(mine)[0]![1].click();
    buttons(mine)[2]![1].click();
    expect(asked).toEqual([
      `toggle:${site}/a.json:true`,
      `move:${site}/a.json:-1`,
      `remove:${site}/a.json`,
    ]);
  });

  test('a manifest on another site asks for access, or says it cannot', async () => {
    const {setting, asked} = fakeSetting({
      ...empty,
      entries: [
        {
          url: 'https://cdn.example/a.json',
          enabled: true,
          linked: true,
          access: 'grant',
        },
        {
          url: 'https://other.example/b.json',
          enabled: true,
          linked: false,
          access: 'unavailable',
        },
      ],
    });
    useManifestSetting(setting);
    const section = docsSection(await mount())!;
    const [grant, unavailable] = section.querySelectorAll('.manifest-row');
    // Another site's URL is shown whole.
    expect(grant!.querySelector('code')!.textContent).toBe(
      'https://cdn.example/a.json'
    );
    const allow = buttons(grant!).find(([text]) =>
      text.startsWith('Allow access')
    )!;
    expect(allow[0]).toBe('Allow access to cdn.example');
    allow[1].click();
    await vi.waitFor(() =>
      expect(section.querySelector('[role=alert]')?.textContent).toContain(
        'was not granted'
      )
    );
    expect(asked).toEqual(['allow:https://cdn.example/a.json']);
    expect(unavailable!.textContent).toContain(
      "can't grant access to other.example"
    );
  });

  test('adds what the user typed and shows a refusal', async () => {
    const {setting, asked} = fakeSetting(empty);
    useManifestSetting(setting);
    const section = docsSection(await mount())!;
    const input = section.querySelector('wa-input') as HTMLElement & {
      value: string;
    };
    input.value = 'https://elsewhere.test/cem.json';
    section
      .querySelector('form')!
      .dispatchEvent(new Event('submit', {cancelable: true}));
    await vi.waitFor(() =>
      expect(section.querySelector('[role=alert]')?.textContent).toContain(
        `Must be on ${site}`
      )
    );
    expect(asked).toEqual(['add:https://elsewhere.test/cem.json']);
  });

  test('offers each found manifest and keeps each ignored one in view', async () => {
    const {setting, asked, update} = fakeSetting({
      ...empty,
      found: [`${site}/dist/custom-elements.json`],
      ignored: [`${site}/vendor/custom-elements.json`],
    });
    useManifestSetting(setting);
    const root = await mount();
    const host = root.host as DevtoolsSettings;
    const [found, ignored] =
      docsSection(root)!.querySelectorAll('.manifest-found');
    expect(found!.textContent).toContain('Found /dist/custom-elements.json');
    expect(buttons(found!).map(([label]) => label)).toEqual([
      'Use it',
      'Always ignore',
    ]);
    expect(ignored!.textContent?.replace(/\s+/g, ' ')).toContain(
      "Ignored /vendor/custom-elements.json, found beside the page's scripts."
    );
    expect(buttons(ignored!).map(([label]) => label)).toEqual([
      'Use it',
      'Reset',
    ]);
    for (const [, b] of [...buttons(found!), ...buttons(ignored!)]) b.click();
    expect(asked).toEqual([
      `use:${site}/dist/custom-elements.json`,
      `ignore:${site}/dist/custom-elements.json`,
      `use:${site}/vendor/custom-elements.json`,
      `reset:${site}/vendor/custom-elements.json`,
    ]);

    update(empty);
    await host.updateComplete;
    expect(docsSection(root)!.querySelector('.manifest-found')).toBeNull();
  });
});
