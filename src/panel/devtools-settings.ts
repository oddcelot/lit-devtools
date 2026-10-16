import {LitElement, html, css, nothing} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import '@awesome.me/webawesome/dist/components/badge/badge.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/callout/callout.js';
import '@awesome.me/webawesome/dist/components/card/card.js';
import '@awesome.me/webawesome/dist/components/input/input.js';
import './wa-icons.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/switch/switch.js';
import type WaInput from '@awesome.me/webawesome/dist/components/input/input.js';
import type WaSelect from '@awesome.me/webawesome/dist/components/select/select.js';
import type WaSwitch from '@awesome.me/webawesome/dist/components/switch/switch.js';
import {tokens} from '../lib/tokens.js';
import {waSquare} from './wa-square.js';
import type {ColorSchemePreference} from '../lib/color-scheme.js';
import {
  type FeatureSettings,
  type OverrideBaselines,
  type SettingsOverride,
} from '../types/timeline.js';
import {
  type SettingKey,
  type SettingKeyOf,
} from '../lib/setting-definitions.js';
import {presentationOf} from './setting-presentation.js';
import {settingRow, type SettingRow} from './setting-rows.js';
import {getMeta, litSettingsRpc, type LitClient} from './client.js';
import type {LitGetMetaResult} from '../lib/devframe/protocol.js';
import type {OverridableKey} from '../lib/settings-override.js';
import {overrides} from './settings-override.js';
import {
  manifestSetting,
  type ManifestEntryState,
  type ManifestSetting,
} from './manifest-setting.js';

/** The guide sections on where the Lit tracks appear: Chrome's, then the rest. */
const CHROME_TRACKS_DOCS =
  'https://oddcelot.github.io/vite-plugin-lit/guides/devtools/timeline/#see-it-in-chromes-performance-panel';
const USER_TIMING_DOCS =
  'https://oddcelot.github.io/vite-plugin-lit/guides/devtools/timeline/#in-firefox-and-older-chrome';

/** A feature switch: shown in a section header, never overridden. */
type FeatureKey = SettingKeyOf<'feature'>;

/** The settings this panel persists, as `DevframeSettingsRegistry.lit`. */
type LitSettings = Awaited<ReturnType<LitClient['settings']['global']['all']>>;

/**
 * Settings view. Shows the plugin's resolved feature settings and lets the
 * HMR ones be overridden live — persisted (same-origin localStorage, read by
 * the app runtime on load) and pushed over HMR for immediate effect. Settings
 * whose feature is disabled at config time can't be enabled here (their runtime
 * isn't injected); those stay read-only.
 */
@customElement('devtools-settings')
export class DevtoolsSettings extends LitElement {
  static override styles = [
    tokens,
    waSquare,
    css`
      :host {
        display: block;
        flex: 1;
        overflow-y: auto;
        padding: var(--lit-devtools-space-5) var(--lit-devtools-space-6);
        font-size: var(--lit-devtools-text-xs);
        line-height: var(--lit-devtools-leading-normal);
      }
      .note {
        color: var(--lit-devtools-text-muted);
        margin: 0 0 var(--lit-devtools-space-5);
      }
      .note code {
        color: var(--lit-devtools-accent);
        font-family: var(--lit-devtools-font-mono);
      }
      section {
        margin-bottom: var(--lit-devtools-space-5);
      }
      wa-card {
        --spacing: 0;
      }
      wa-card::part(header) {
        padding: var(--lit-devtools-space-3) var(--lit-devtools-space-5);
      }
      h3 {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-4);
        margin: 0;
        font-size: var(--lit-devtools-text-2xs);
        font-weight: var(--lit-devtools-weight-semibold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--lit-devtools-text-secondary);
      }
      /* Section status: a soft tint, not a solid fill, so it never outshouts
         the controls below it. */
      .pill {
        text-transform: none;
        letter-spacing: 0;
        border: 0;
        background: var(--lit-devtools-surface-container);
        color: var(--lit-devtools-text-muted);
      }
      .pill.on {
        background: var(--lit-devtools-success-soft);
        color: var(--lit-devtools-success);
      }
      .reset {
        display: block;
        width: fit-content;
        margin-top: var(--wa-space-xs);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        /* One fixed label column, so every section's values line up. */
        table-layout: fixed;
      }
      td {
        height: var(--lit-devtools-control-height);
        padding: var(--lit-devtools-space-2) var(--lit-devtools-space-5);
        vertical-align: middle;
      }
      tr:not(:last-child) td {
        border-bottom: 1px solid var(--lit-devtools-border);
      }
      .key {
        color: var(--lit-devtools-text-muted);
        white-space: nowrap;
        width: 11em;
      }
      .key[data-tip] {
        cursor: help;
        text-underline-offset: 3px;
      }
      /* The tooltip affordance shows on demand; always-on it reads as a link. */
      .key[data-tip]:hover,
      .key[data-tip]:focus-visible {
        text-decoration: underline dotted;
      }
      .opt-src {
        opacity: 0.7;
        font-size: var(--lit-devtools-text-2xs);
      }
      .val {
        color: var(--lit-devtools-text);
        font-family: var(--lit-devtools-font-mono);
      }
      .env {
        color: var(--lit-devtools-text-muted);
        font-family: var(--lit-devtools-font-mono);
        font-size: var(--lit-devtools-text-2xs);
      }
      wa-badge.env {
        font-family: var(--lit-devtools-font-mono);
        vertical-align: middle;
      }
      /* An origin tag, "(option)" or "(env)": muted text, not a button. */
      wa-badge.env:not(.ovr) {
        border: 0;
        background: var(--lit-devtools-surface-container);
        color: var(--lit-devtools-text-muted);
        font-size: var(--lit-devtools-text-2xs);
        font-weight: var(--lit-devtools-weight-regular);
        text-transform: none;
        letter-spacing: 0;
      }
      .src {
        margin-left: var(--lit-devtools-space-3);
        vertical-align: middle;
      }
      .docs-link {
        margin-left: var(--lit-devtools-space-3);
        vertical-align: middle;
      }
      .row-reset {
        margin-left: var(--lit-devtools-space-3);
        vertical-align: middle;
      }
      .nudge {
        display: block;
        margin-top: var(--lit-devtools-space-2);
        font-size: var(--lit-devtools-text-2xs);
      }
      wa-switch,
      wa-select {
        vertical-align: middle;
      }
      wa-select {
        display: inline-block;
        min-width: 9em;
        font-family: var(--lit-devtools-font-mono);
      }
      wa-select::part(combobox) {
        min-height: var(--lit-devtools-control-height);
        height: var(--lit-devtools-control-height);
      }
      wa-switch::part(base) {
        align-items: center;
      }
      .row-disabled {
        opacity: 0.5;
      }
      .empty {
        color: var(--lit-devtools-text-muted);
        padding: var(--lit-devtools-space-3) var(--lit-devtools-space-5);
      }
      .empty code {
        color: var(--lit-devtools-accent);
        font-family: var(--lit-devtools-font-mono);
      }
      .loading {
        color: var(--lit-devtools-text-muted);
      }
      .manifest {
        display: flex;
        gap: var(--lit-devtools-space-2);
        align-items: center;
      }
      .manifest wa-input {
        flex: 1;
        min-width: 0;
      }
      /* The label names the input for assistive tech; the key cell beside it
         already says it on screen. */
      .manifest wa-input::part(form-control-label) {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .manifest-error {
        color: var(--lit-devtools-error);
        margin: var(--lit-devtools-space-1) 0 0;
      }
      .manifest-note {
        color: var(--lit-devtools-text-muted);
        padding: var(--lit-devtools-space-3) var(--lit-devtools-space-5);
        margin: 0;
      }
      .manifest-note code {
        color: var(--lit-devtools-accent);
        font-family: var(--lit-devtools-font-mono);
      }
      .manifest-found {
        display: flex;
        flex-wrap: wrap;
        gap: var(--lit-devtools-space-2);
        align-items: center;
        padding: var(--lit-devtools-space-3) var(--lit-devtools-space-5);
        border-top: 1px solid var(--lit-devtools-border);
      }
      .manifest-entry {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-2);
      }
      .manifest-entry code {
        color: var(--lit-devtools-accent);
        font-family: var(--lit-devtools-font-mono);
      }
      .manifest-entry .spacer {
        flex: 1;
      }
      .manifest-access {
        color: var(--lit-devtools-text-muted);
      }
      .manifest-found code {
        color: var(--lit-devtools-accent);
        font-family: var(--lit-devtools-font-mono);
      }
    `,
  ];

  @state() private _settings: FeatureSettings | null = null;
  @state() private _meta: LitGetMetaResult | null = null;
  @state() private _override: SettingsOverride = {};
  @state() private _recorded: OverrideBaselines = {};
  @state() private _loaded = false;
  @state() private _colorScheme: ColorSchemePreference = 'auto';

  private _unsubscribeOverride: (() => void) | null = null;
  private _unsubscribeManifest: (() => void) | null = null;
  /** Why the manifest URL typed last was refused, until the next try. */
  @state() private _manifestError = '';

  override connectedCallback() {
    super.connectedCallback();
    // Synchronous first, from `localStorage`, so the tab paints the right
    // values (and the panel the right scheme) with no flash. `_hydrate()`
    // then reconciles against the durable store, which is what makes these
    // preferences survive a different browser or cleared site data.
    this._override = overrides.get();
    this._recorded = overrides.baselines();
    // Other tabs (Components' Flash button) flip overrides too; stay in sync.
    this._unsubscribeOverride = overrides.subscribe((o) => {
      this._override = o;
      this._recorded = overrides.baselines();
    });
    this._colorScheme = overrides.appearance();
    this._unsubscribeManifest =
      manifestSetting()?.subscribe(() => this.requestUpdate()) ?? null;
    void this._fetch();
    void this._hydrate();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeOverride?.();
    this._unsubscribeOverride = null;
    this._unsubscribeManifest?.();
    this._unsubscribeManifest = null;
  }

  /**
   * Adopt the persisted preferences from devframe's per-user settings store,
   * letting them win over this browser's `localStorage` copy.
   *
   * `global`, not `project`: in `devframe@1.0.0` the `project` store lives in
   * `<workspaceRoot>/node_modules/.<app>/devframe` (private per checkout, and
   * wiped by a clean install), while `global` is per-user, which is what "my
   * editor", "my color scheme", "how I like HMR to behave" actually are.
   * Project-wide defaults already have a home: the committed `litPlugin({...})`
   * config.
   *
   * Subscribes rather than reading once. The client-side store is a mirror of
   * a shared state, and it is empty until the first sync arrives -- a `get()`
   * issued right after connecting reads `undefined` even when the server has
   * a value on disk. `onChange` gets the first sync as an update; the `all()`
   * below covers a sync that landed before the subscription did.
   *
   * Never throws: without a hub the panel just keeps its `localStorage`
   * values.
   */
  private async _hydrate(): Promise<void> {
    try {
      const {settings} = await litSettingsRpc();
      await settings.global.onChange((all) => this._adopt(all));
      this._adopt(await settings.global.all());
    } catch {
      // dev tool — a missing or unreachable settings store is not an error
    }
  }

  /** Apply a settings snapshot from the durable store. */
  private _adopt(all: Readonly<LitSettings>): void {
    const {appearance, override, overrideBaselines} = all;
    // Mirrors to the page and `localStorage` without writing back to the
    // store the value just came from; `_override` updates via the listener.
    // The baselines come along so a second browser judges "config changed"
    // against what the first one recorded. A snapshot that already matches is
    // a no-op, which is what stops the adopt -> store write -> `onChange` ->
    // adopt loop.
    overrides.adopt({override, overrideBaselines, appearance});
    this._colorScheme = overrides.appearance();
  }

  private _setColorScheme(scheme: ColorSchemePreference): void {
    this._colorScheme = scheme;
    // `localStorage` first and synchronously: it applies the class right
    // away, and is what the panel reads before its first paint next time.
    overrides.setAppearance(scheme);
  }

  private async _fetch() {
    try {
      const meta = await getMeta();
      this._settings = meta.features;
      this._meta = meta;
    } catch {
      this._settings = null;
      this._meta = null;
    } finally {
      this._loaded = true;
    }
  }

  private _set<K extends keyof SettingsOverride>(
    key: K,
    value: SettingsOverride[K]
  ) {
    // The module records the config value this override was made against, so
    // a later change to `.env` or the plugin options can be pointed out.
    overrides.set(key, value, this._settings ?? undefined);
  }

  /** Clear overrides and revert the runtime to the resolved env values. */
  private _reset() {
    overrides.reset(this._settings ?? undefined);
  }

  /** Drop one overridden setting, reverting it (live) to its baseline. */
  private _resetKey(key: OverridableKey) {
    const s = this._settings;
    if (s === null) return;
    overrides.resetKey(key, s);
  }

  private _pill(on: boolean) {
    return html`<wa-badge
      class="pill ${on ? 'on' : ''}"
      size="small"
      variant=${on ? 'success' : 'neutral'}
      >${on ? 'enabled' : 'disabled'}</wa-badge
    >`;
  }

  /**
   * A section header's on/off pill for a feature switch, with the origin
   * badge saying whether an option or env turned it on or off.
   */
  private _feature(key: FeatureKey) {
    const row = this._rowOf(key);
    return html`${this._pill(row.value === true)} ${this._badge(row)}`;
  }

  /** How to turn a feature on, naming its plugin option. */
  private _enableHint(key: FeatureKey, lead = 'Enable with') {
    return html`<p class="empty">
      ${lead} <code>${presentationOf(key).option}: true</code>.
    </p>`;
  }

  private _rowOf(key: SettingKey): SettingRow {
    return settingRow(key, {
      config: this._settings,
      override: this._override,
      recorded: this._recorded,
    });
  }

  /**
   * Badge behind a row's value. Without an override it's the plain origin
   * badge, "(env)" or "(option)", and nothing for a built-in default, which
   * is most rows and would only be noise. With one it's the baseline it
   * replaced ("env: Zed"), in the brand colour, and a reset for just this
   * row. When the config value moved since the override was made, a second
   * line says so and offers Reset or Keep.
   */
  private _badge(row: SettingRow) {
    const {override} = row;
    if (!override) {
      return row.origin && row.origin !== 'default'
        ? html`<wa-badge
            class="env src"
            size="small"
            appearance="outlined"
            variant="neutral"
            >(${row.origin})</wa-badge
          >`
        : nothing;
    }
    const key = row.key as OverridableKey;
    const src = override.source;
    const s = this._settings;
    return html`<wa-badge
        class="env src ovr"
        size="small"
        appearance="outlined"
        variant="brand"
        >${src}: ${override.baseline}</wa-badge
      >
      <wa-button
        class="row-reset"
        appearance="plain"
        size="small"
        aria-label="Reset to the ${src} value"
        data-tip="Reset to the ${src} value"
        @click=${() => this._resetKey(key)}
      >
        <wa-icon name="x" label="Reset to the ${src} value"></wa-icon>
      </wa-button>
      ${
        override.moved
          ? html`<wa-callout
              class="nudge"
              data-nudge=${key}
              variant="warning"
              size="small"
            >
              <span
                >Config changed since you overrode this: was
                ${override.moved.was}, now ${override.moved.now}</span
              >
              <wa-button
                size="small"
                data-tip="Discard your override and use the new ${src} value"
                @click=${() => this._resetKey(key)}
                >Reset</wa-button
              >
              <wa-button
                size="small"
                data-tip="Keep your override and stop flagging the config change"
                @click=${() => s !== null && overrides.keep(key, s)}
              >
                Keep
              </wa-button>
            </wa-callout>`
          : nothing
      }`;
  }

  /** A row's control: a switch, a select, or the value as text. */
  private _control(row: SettingRow) {
    const set = (value: unknown) =>
      this._set(row.key as keyof SettingsOverride, value as never);
    switch (row.definition.kind) {
      case 'switch':
        return html`<wa-switch
          size="small"
          .checked=${row.value === true}
          ?disabled=${row.disabled}
          @change=${(e: Event) => set((e.target as WaSwitch).checked)}
        >
          ${row.text}
        </wa-switch>`;
      case 'select':
        return html`<wa-select
          size="small"
          .value=${String(row.value)}
          ?disabled=${row.disabled}
          @change=${(e: Event) => set((e.target as WaSelect).value)}
        >
          ${row.options?.map(
            (option) =>
              html`<wa-option
                value=${String(option.value)}
                .label=${option.text}
                >${option.text}${
                  option.marker
                    ? html`<span slot="end" class="opt-src"
                        >${option.marker}</span
                      >`
                    : nothing
                }</wa-option
              >`
          )}
        </wa-select>`;
      default:
        return html`${row.text}`;
    }
  }

  /** One Setting's row. `after` trails the value, such as a docs link. */
  private _row(key: SettingKey, after: unknown = nothing) {
    const row = this._rowOf(key);
    return html`
      <tr class=${row.disabled ? 'row-disabled' : ''}>
        <td class="key" tabindex="0" data-tip=${row.tip}>${row.label}</td>
        <td class="val">${this._control(row)} ${this._badge(row)} ${after}</td>
      </tr>
    `;
  }

  private _renderAppearance() {
    return html`
      <section>
        <wa-card>
          <h3 slot="header">Appearance</h3>
          <table>
            <tr>
              <td
                class="key"
                data-tip="Light or dark panel. Auto follows the system. Default: Auto"
              >
                color scheme
              </td>
              <td class="val">
                <wa-select
                  size="small"
                  .value=${this._colorScheme}
                  @change=${(e: Event) =>
                    this._setColorScheme(
                      (e.target as WaSelect).value as ColorSchemePreference
                    )}
                >
                  ${(
                    [
                      ['auto', 'Auto'],
                      ['dark', 'Dark'],
                      ['light', 'Light'],
                    ] as Array<[ColorSchemePreference, string]>
                  ).map(
                    ([value, label]) =>
                      html`<wa-option value=${value} .label=${label}
                        >${label}${
                          value === 'auto'
                            ? html`<span slot="end" class="opt-src"
                                >default</span
                              >`
                            : nothing
                        }</wa-option
                      >`
                  )}
                </wa-select>
              </td>
            </tr>
          </table>
        </wa-card>
      </section>
    `;
  }

  private _renderHmr(s: FeatureSettings) {
    if (!s.hmr.enabled) return this._enableHint('hmr');
    return html`
      <table>
        ${this._row('hmrReconnect')} ${this._row('hmrOnIncompatible')}
        ${this._row('hmrChildState')} ${this._row('hmrIndicatorVisible')}
        ${this._row('hmrIndicatorCount')}
      </table>
    `;
  }

  /**
   * The editor select. A custom `EditorConfig` object (reported as
   * `'custom'`) isn't one of the built-in choices, so the select is disabled
   * and just shows "Custom".
   */
  private _renderEditorRow(s: FeatureSettings) {
    if (s.sourceOverlay.editor !== 'custom') {
      return this._row('sourceOverlayEditor');
    }
    const row = this._rowOf('sourceOverlayEditor');
    return html`
      <tr>
        <td class="key" tabindex="0" data-tip=${row.tip}>${row.label}</td>
        <td class="val">
          <wa-select size="small" disabled .value=${'custom'}>
            <wa-option value="custom" disabled>Custom</wa-option>
          </wa-select>
          ${this._badge(row)}
        </td>
      </tr>
    `;
  }

  /**
   * Preferences for the Components tab: the page overlay and the details
   * pane. Pure preferences, no config-time baseline, so an unset value simply
   * means off and the "overridden" marker never applies.
   */
  private _renderComponents() {
    return html`
      <table>
        ${this._row('flashUpdates')} ${this._row('flashUpdatesRamp')}
        ${this._row('inlineDocs')}
      </table>
    `;
  }

  /**
   * Timeline preferences. Pure preference, no config-time baseline, so an
   * unset value means off. Where the page's browser has no custom tracks,
   * a note says where the entries go instead.
   */
  private _renderTimelinePrefs() {
    // The page's browser, not this panel's: the runtime reports it.
    const userTiming = this._meta?.runtime.chromeTracks === false;
    return html`
      <table>
        ${this._row(
          'chromeTracks',
          html`<wa-button
            class="docs-link"
            appearance="plain"
            size="small"
            href=${userTiming ? USER_TIMING_DOCS : CHROME_TRACKS_DOCS}
            target="_blank"
            data-tip=${
              userTiming
                ? 'Open the guide on finding the Lit entries in the Firefox Profiler'
                : 'Open the guide with a screenshot of the Lit tracks in Chrome'
            }
          >
            <wa-icon slot="end" name="arrow-square-out"></wa-icon>
            Where to find them
          </wa-button>`
        )}
      </table>
      ${
        userTiming
          ? html`<p class="note">
              This browser has no custom tracks, so the entries go to User
              Timing as <code>lit:</code> marks and measures (in the Firefox
              Profiler, the Marker Chart of the page's own track).
            </p>`
          : nothing
      }
    `;
  }

  /**
   * Versions, layers and picker as `get-meta` reports them: the first thing
   * to check when the panel or the Components tab looks wrong.
   */
  private async _addManifest(e: Event): Promise<void> {
    e.preventDefault();
    const input = this.renderRoot.querySelector<WaInput>('.manifest wa-input');
    const error = await manifestSetting()?.add(String(input?.value ?? ''));
    this._manifestError = error ?? '';
    if (error === undefined && input !== null) input.value = '';
  }

  /**
   * Which Custom Elements Manifests the panel reads docs from, where the
   * host lets the user choose (`manifest-setting.ts`): one ordered list of
   * the page's own links and the ones the user added, each switchable, then
   * found ones on offer or ignored.
   */
  private _renderManifest() {
    const setting = manifestSetting();
    const m = setting?.state();
    if (setting === undefined || m === undefined) return nothing;
    const path = (url: string) =>
      url.startsWith(`${m.site}/`) ? url.slice(m.site.length) : url;
    const last = m.entries.length - 1;
    return html`<section>
      <wa-card>
        <h3 slot="header">Component docs</h3>
        ${
          m.entries.length > 1
            ? html`<p class="manifest-note">
                Read in this order: a component's docs come from the first
                switched-on manifest that describes it.
              </p>`
            : nothing
        }
        <table>
          ${m.entries.map(
            (entry, i) => html`<tr class="manifest-row">
              <td class="val manifest-entry">
                <wa-switch
                  size="small"
                  .checked=${entry.enabled}
                  @change=${(e: Event) =>
                    void setting.toggle(
                      entry.url,
                      (e.target as WaSwitch).checked
                    )}
                  ><code>${path(entry.url)}</code></wa-switch
                >
                ${
                  entry.linked
                    ? html`<wa-badge
                        variant="neutral"
                        appearance="outlined"
                        title="The page links it with rel=custom-elements-manifest"
                        >linked by page</wa-badge
                      >`
                    : nothing
                }
                ${this._renderAccess(setting, entry)}
                <span class="spacer"></span>
                <wa-button
                  size="small"
                  appearance="plain"
                  ?disabled=${i === 0}
                  @click=${() => void setting.move(entry.url, -1)}
                  ><wa-icon
                    name="caret-up"
                    label="Move ${path(entry.url)} up"
                  ></wa-icon
                ></wa-button>
                <wa-button
                  size="small"
                  appearance="plain"
                  ?disabled=${i === last}
                  @click=${() => void setting.move(entry.url, 1)}
                  ><wa-icon
                    name="caret-down"
                    label="Move ${path(entry.url)} down"
                  ></wa-icon
                ></wa-button>
                ${
                  entry.linked
                    ? nothing
                    : html`<wa-button
                        size="small"
                        appearance="plain"
                        @click=${() => void setting.remove(entry.url)}
                        >Remove</wa-button
                      >`
                }
              </td>
            </tr>`
          )}
        </table>
        <table>
          <tr>
            <td
              class="key"
              data-tip="A Custom Elements Manifest on ${m.site} to read component docs from. A path or a URL on the site."
            >
              add manifest
            </td>
            <td class="val">
              <form class="manifest" @submit=${this._addManifest}>
                <wa-input
                  size="small"
                  label="Custom Elements Manifest URL"
                  placeholder="Path or URL on this site"
                  spellcheck="false"
                ></wa-input>
                <wa-button size="small" type="submit">Add</wa-button>
              </form>
              ${
                this._manifestError === ''
                  ? nothing
                  : html`<p class="manifest-error" role="alert">
                      ${this._manifestError}
                    </p>`
              }
            </td>
          </tr>
        </table>
        ${m.found.map((url) =>
          this._renderFoundManifest(setting, path(url), url, false)
        )}
        ${m.ignored.map((url) =>
          this._renderFoundManifest(setting, path(url), url, true)
        )}
      </wa-card>
    </section>`;
  }

  /**
   * For a manifest on another site the extension may not read yet: a button
   * that asks the browser for access, or why it can't. The click handler
   * calls `allow` synchronously, as the browser asks only during a gesture.
   */
  private _renderAccess(setting: ManifestSetting, entry: ManifestEntryState) {
    if (entry.access === undefined) return nothing;
    const host = new URL(entry.url).host;
    if (entry.access === 'unavailable') {
      return html`<span class="manifest-access"
        >Not read: this browser can't grant access to ${host} from
        DevTools</span
      >`;
    }
    return html`<wa-button
      size="small"
      @click=${async () => {
        this._manifestError = (await setting.allow(entry.url)) ?? '';
      }}
      >Allow access to ${host}</wa-button
    >`;
  }

  /**
   * A manifest found beside the page's scripts: on offer, with Use it and
   * Always ignore, or ignored, with Use it and Reset.
   */
  private _renderFoundManifest(
    setting: ManifestSetting,
    shown: string,
    url: string,
    ignored: boolean
  ) {
    return html`<div class="manifest-found">
      <span
        >${ignored ? 'Ignored' : 'Found'} <code>${shown}</code>${
          ignored ? ', found' : ''
        }
        beside the page's scripts.</span
      >
      <wa-button size="small" @click=${() => void setting.use(url)}
        >Use it</wa-button
      >
      ${
        ignored
          ? html`<wa-button
              size="small"
              appearance="plain"
              @click=${() => void setting.reset(url)}
              >Reset</wa-button
            >`
          : html`<wa-button
              size="small"
              appearance="plain"
              @click=${() => void setting.ignore(url)}
              >Always ignore</wa-button
            >`
      }
    </div>`;
  }

  private _renderAbout() {
    const meta = this._meta;
    if (meta === null) return nothing;
    const packages = Object.entries(
      meta.runtime.ready ? meta.runtime.litPackages : {}
    );
    return html`
      <section>
        <wa-card>
          <h3 slot="header">About</h3>
          <table>
            <tr>
              <td class="key">plugin version</td>
              <td class="val">${meta.version}</td>
            </tr>
            ${
              packages.length === 0
                ? html`<tr>
                    <td class="key">lit</td>
                    <td class="val">not detected</td>
                  </tr>`
                : packages.map(
                    ([name, versions]) => html`<tr>
                      <td class="key">${name}</td>
                      <td class="val">
                        ${
                          versions.join(', ') +
                          (versions.length > 1 ? ' (duplicate copies)' : '')
                        }
                      </td>
                    </tr>`
                  )
            }
            <tr>
              <td class="key">timeline layers</td>
              <td class="val">${meta.layers.map((l) => l.label).join(', ')}</td>
            </tr>
            <tr>
              <td class="key">element picker</td>
              <td class="val">
                ${meta.picker ? 'available' : 'unavailable (enable sourceOverlay)'}
              </td>
            </tr>
          </table>
          <p class="note">
            Settings resolve in this order: panel override, then plugin option,
            then default. An explicit <code>timeline: false</code> in the plugin
            options is final.
          </p>
        </wa-card>
      </section>
    `;
  }

  override render() {
    if (!this._loaded) {
      return html`<p class="loading">Loading settings…</p>`;
    }
    const s = this._settings;
    const appearance = this._renderAppearance();
    if (s === null) {
      // Off the Vite plugin there are no plugin options or env to resolve;
      // saying so beats a bare "unavailable" that reads like a fault. The
      // page-side preferences still apply there: they have no config-time
      // baseline, and the runtime those hosts inject always has the timeline.
      const offPlugin = this._meta?.capabilities.pluginSettings === false;
      return html`${appearance}
        <p class="empty">
          ${
            offPlugin
              ? 'Plugin settings need the Vite plugin; this page is inspected without a Vite dev server.'
              : 'Settings unavailable.'
          }
        </p>
        ${
          offPlugin
            ? html`<section>
                  <wa-card>
                    <h3 slot="header">Components</h3>
                    ${this._renderComponents()}
                  </wa-card>
                </section>
                <section>
                  <wa-card>
                    <h3 slot="header">Timeline</h3>
                    ${this._renderTimelinePrefs()}
                  </wa-card>
                </section>`
            : nothing
        }
        ${this._renderManifest()} ${this._renderAbout()}`;
    }
    const hasOverride = Object.keys(this._override).length > 0;
    return html`
      <p class="note">
        Resolved from the plugin options at startup. Controls below override the
        running app live; the rest are config-time (change them in your Vite
        config and restart).
        ${
          hasOverride
            ? html`<wa-button
                class="reset"
                size="small"
                appearance="outlined"
                data-tip="Discard every override and use the configured values"
                @click=${this._reset}
              >
                <wa-icon slot="start" name="arrow-counter-clockwise"></wa-icon>
                Reset overrides
              </wa-button>`
            : nothing
        }
      </p>

      ${appearance}

      <section>
        <wa-card>
          <h3 slot="header">HMR ${this._feature('hmr')}</h3>
          ${this._renderHmr(s)}
        </wa-card>
      </section>

      <section>
        <wa-card>
          <h3 slot="header">
            Source Overlay ${this._feature('sourceOverlay')}
          </h3>
          ${
            s.sourceOverlay.enabled
              ? html`<table>
                  ${this._row('sourceOverlayKey')} ${this._renderEditorRow(s)}
                  ${this._row('sourceOverlayThrottleMs')}
                </table>`
              : this._enableHint('sourceOverlay')
          }
        </wa-card>
      </section>

      <section>
        <wa-card>
          <h3 slot="header">Components ${this._feature('timeline')}</h3>
          ${
            s.timeline
              ? this._renderComponents()
              : this._enableHint(
                  'timeline',
                  'Needs the timeline runtime: enable with'
                )
          }
        </wa-card>
      </section>

      <section>
        <wa-card>
          <h3 slot="header">Timeline ${this._feature('timeline')}</h3>
          <p class="empty">
            Layers and recording are controlled in the Timeline tab.
          </p>
          ${s.timeline ? this._renderTimelinePrefs() : nothing}
        </wa-card>
      </section>

      ${this._renderManifest()} ${this._renderAbout()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'devtools-settings': DevtoolsSettings;
  }
}
