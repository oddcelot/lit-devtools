/**
 * Remembered consent for third-party embeds. A docs page loads nothing from
 * another site until the visitor starts an embed; one that ticks "always
 * load" for a provider skips that step on later pages, until they take it
 * back. The choice lives in localStorage on this origin and nowhere else;
 * where storage is blocked, every embed simply asks again.
 */
export type Provider = 'youtube';

const key = (provider: Provider) => `vite-plugin-lit-docs:consent:${provider}`;

export function hasConsent(provider: Provider): boolean {
  try {
    return localStorage.getItem(key(provider)) === 'granted';
  } catch {
    return false;
  }
}

export function setConsent(provider: Provider, granted: boolean): void {
  try {
    if (granted) localStorage.setItem(key(provider), 'granted');
    else localStorage.removeItem(key(provider));
  } catch {
    // Storage blocked: the choice lasts for this click only.
  }
}
