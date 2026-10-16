/**
 * Which Custom Elements Manifest the panel reads component docs from, where
 * the host lets the user choose: the Lit Inspector extension, on sites that
 * host a manifest without linking it. The Settings tab renders it as its
 * Component docs section; the Vite plugin reads manifests from disk and
 * registers nothing, so the section is absent there. A seam of the panel,
 * like `breakpoints.ts`: only the extension holds the per-site storage and
 * the fetches behind it.
 */

/** What the panel shows for the inspected site. */
export interface ManifestState {
  /** The inspected site's origin. */
  site: string;
  /** The manifests the page links itself; the user's choice yields to them. */
  linked: string[];
  /** The manifest the user set for the site. */
  url?: string;
  /** A manifest found beside the page's scripts, on offer. */
  found?: string;
}

export interface ManifestSetting {
  state(): ManifestState | undefined;
  /**
   * Set the site's manifest from what the user typed, a path or a URL on the
   * site; empty clears it. Resolves an error message when it was refused.
   */
  set(input: string): Promise<string | undefined>;
  /** Take the manifest on offer. */
  use(): Promise<void>;
  /** Turn down the manifest on offer, for good on this site. */
  dismiss(): Promise<void>;
  /** Called whenever {@link state} changes; returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

let current: ManifestSetting | undefined;

/** Sets the host's manifest setting; `undefined` removes it. Call before mounting. */
export const useManifestSetting = (
  setting: ManifestSetting | undefined
): void => {
  current = setting;
};

/** The host's manifest setting, when it has one. */
export const manifestSetting = (): ManifestSetting | undefined => current;
