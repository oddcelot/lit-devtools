/**
 * Where Lit Inspector and the editor extensions are published. Every store
 * button on the site reads this, so a listing going live is a one-line
 * change here: set its `url` and the "Coming soon" placeholder turns into a
 * link on every page at once.
 */
export const stores = {
  chrome: {
    name: 'Chrome Web Store',
    url: 'https://chromewebstore.google.com/detail/lit-inspector/faojnglflincboehhgkjgehnapjgiieh' as
      | string
      | undefined,
  },
  firefox: {
    name: 'Firefox Add-ons',
    url: 'https://addons.mozilla.org/firefox/addon/lit-inspector/' as
      | string
      | undefined,
  },
  vscode: {
    name: 'VS Code Marketplace',
    url: 'https://marketplace.visualstudio.com/items?itemName=oddsquad.lit-devtools' as
      | string
      | undefined,
  },
  'open-vsx': {
    name: 'Open VSX',
    url: 'https://open-vsx.org/extension/oddsquad/lit-devtools' as
      | string
      | undefined,
  },
  // Listed once zed-industries/extensions#8130 merges, as
  // https://zed.dev/extensions/lit-lsp.
  zed: {
    name: 'Zed Extensions',
    url: undefined as string | undefined,
  },
};

export type Store = keyof typeof stores;

/** Which stores a group of buttons shows, in order. */
export const storeGroups = {
  inspector: ['chrome', 'firefox'],
  editor: ['vscode', 'open-vsx', 'zed'],
} satisfies Record<string, Store[]>;

/**
 * `url` tagged with UTM parameters, so the store's own analytics can tell
 * the docs' clicks apart: the Chrome Web Store dashboard breaks listing page
 * views down by `utm_source`, `utm_medium` and `utm_campaign`. `campaign`
 * names the page the link sits on.
 */
export const trackedUrl = (url: string, campaign: string): string => {
  const tracked = new URL(url);
  tracked.searchParams.set('utm_source', 'docs');
  tracked.searchParams.set('utm_medium', 'store-button');
  tracked.searchParams.set('utm_campaign', campaign);
  return tracked.href;
};
