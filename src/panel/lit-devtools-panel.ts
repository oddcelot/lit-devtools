import {LitElement, html, css, nothing} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {tokens} from '../lib/tokens.js';
import './timeline-view.js';
import {panelBrand} from './brand.js';
import {litRpc} from './client.js';
import {hostInfo, sendToPage} from './host.js';
import {clearTimelineEvents} from './timeline-store.js';
import type {
  LitRuntimeInfo,
  PageChangedEvent,
} from '../lib/devframe/protocol.js';
import type {PageLocation} from '../types/inspector.js';

/** How long a page asked to announce itself gets before it counts as gone. */
const FOLLOW_TIMEOUT_MS = 2000;

/** A page change the notice tells about: the event, and where the earlier
 *  page was, read before the new page's own announcement replaced it. */
interface PageChangeNotice extends PageChangedEvent {
  previous?: PageLocation;
  /** The earlier page didn't answer when asked to be followed again. */
  previousGone?: boolean;
}

import './components-view.js';
import type {ComponentsView} from './components-view.js';
import './updates-view.js';
import {onDeepLink, writeHashLink} from './deep-link.js';
import {PanelLocation} from './panel-location.js';
import type {DeepLinkTab} from './deep-link.js';
import './devtools-settings.js';
import '../../packages/lit-components/src/tabs.js';
import '../../packages/lit-components/src/button.js';
import '../../packages/lit-components/src/icon-button.js';
import '../../packages/lit-components/src/callout.js';
import './wa-icons.js';
import type {TabItem as LitTabItem} from '../../packages/lit-components/src/tabs.js';
import type {IconName} from './wa-icons.js';

/** A header tab, its icon one the panel registers. */
type TabItem = LitTabItem & {icon?: IconName};

/**
 * Tabs hosted by the panel. The Timeline is the first; this list is the
 * extension point for future Lit DevTools views.
 */
const TABS: readonly TabItem[] = [
  {id: 'components', label: 'Components', icon: 'cube'},
  {id: 'updates', label: 'Updates', icon: 'notification'},
  {id: 'timeline', label: 'Timeline', icon: 'clock'},
  {id: 'settings', label: 'Settings', icon: 'gear'},
];

/** Inline Lit logo mark. */
const LIT_LOGO_SVG = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="-32 0 320 320"
  width="20"
  height="20"
  aria-hidden="true"
>
  <path
    fill="#00e8ff"
    d="m64 192l25.926-44.727l38.233-19.114l63.974 63.974l10.833 61.754L192 320l-64-64l-38.074-25.615z"
  />
  <path
    fill="#283198"
    d="M128 256V128l64-64v128zM0 256l64 64l9.202-60.602L64 192l-37.542 23.71z"
  />
  <path
    fill="#324fff"
    d="M64 192V64l64-64v128zm128 128V192l64-64v128zM0 256V128l64 64z"
  />
  <path fill="#0ff" d="M64 320V192l64 64z" />
</svg>`;

/**
 * Root of the Lit DevTools panel — a tabbed shell. Each tab's view is kept
 * mounted and merely hidden when inactive, so the Timeline keeps recording
 * (and holds its events) while another tab is in front.
 */
@customElement('lit-devtools-panel')
export class LitDevtoolsPanel extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        font-family: var(--lit-devtools-font-sans);
        font-size: var(--lit-devtools-text-sm);
        background: var(--lit-devtools-bg);
        color: var(--lit-devtools-text);
        overflow: hidden;
      }
      header {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-6);
        padding: 0 var(--lit-devtools-space-5);
        border-bottom: 1px solid var(--lit-devtools-border);
        background: var(--lit-devtools-surface-low);
        flex-shrink: 0;
        /* A narrow dock sizes the header; the wordmark and the tabs query it. */
        container-type: inline-size;
      }
      /* The tabs take the rest of the row, so they can tell when their
         labels no longer fit (see lit-tabs' compact). */
      lit-tabs {
        flex: 1;
        min-width: 0;
      }
      /* Below this the wordmark and the labelled tabs don't fit side by
         side; the logo alone still says whose panel this is. */
      @container (max-width: 680px) {
        .brand-name {
          display: none;
        }
      }
      .brand {
        display: flex;
        align-items: center;
        gap: var(--lit-devtools-space-4);
        color: var(--lit-devtools-text-strong);
        font-family: var(--lit-devtools-font-display);
        font-weight: var(--lit-devtools-weight-semibold);
        font-size: var(--lit-devtools-text-sm);
        letter-spacing: var(--lit-devtools-tracking-snug);
        padding: var(--lit-devtools-space-5) 0;
      }
      .brand svg,
      .brand img {
        display: block;
      }
      .page-changed {
        flex-shrink: 0;
        border-radius: 0;
        border-width: 0 0 1px;
        font-size: var(--wa-font-size-s);
      }
      .page-changed::part(message) {
        display: flex;
        align-items: center;
        gap: var(--wa-space-xs);
      }
      .page-changed span {
        flex: 1;
      }
      .page-changed code,
      .follow-earlier code {
        font-family: var(--lit-devtools-font-mono);
      }
      /* The followed page, at the far end of the header: data, so mono and
         muted, shortened before it ever pushes the tabs. */
      .followed {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 40%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--lit-devtools-text-muted);
        font-family: var(--lit-devtools-font-mono);
        font-size: var(--lit-devtools-text-xs);
      }
      /* A narrow dock keeps its width for the tabs. Hidden by the header's
         width, not the tabs' compact state, which this would feed back
         into. */
      @container (max-width: 760px) {
        .followed {
          display: none;
        }
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .view {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
      }
    `,
  ];

  /**
   * Which tab is in front and what each view has selected. Deep links write
   * it, the views read and update their own slot, and the URL hash follows
   * it; the shell never reaches into a view for its selection.
   */
  private readonly _location = new PanelLocation();
  private _locationOff: (() => void) | null = null;

  /** Mirrors `ComponentsView.hmrIncompatibilityCount`; see `_onHmrCountChange`. */
  @state() private _hmrCount = 0;
  /** Distinct warned components; see `_onWarningCountChange`. */
  @state() private _warningCount = 0;
  /** What the page last announced; see `_onRuntimeChange`. */
  @state() private _runtime: LitRuntimeInfo | null = null;

  /** The latest `page-changed` notice, until dismissed. */
  @state() private _pageChange: PageChangeNotice | null = null;
  /** The page asked to announce itself from the notice, while it hasn't. */
  @state() private _followRequest: string | null = null;
  private _followTimer: ReturnType<typeof setTimeout> | undefined;

  @query('components-view') private _componentsView?: ComponentsView;

  /**
   * Only the Components details, following the host inspector's selection:
   * the browser extension's Lit tab in the Elements sidebar.
   */
  @property({type: Boolean, attribute: 'details-only'}) detailsOnly = false;

  override connectedCallback() {
    super.connectedCallback();
    this._locationOff = this._location.subscribe(() => {
      this.requestUpdate();
      this._syncHash();
    });
    void this._listenForPageChange();
  }

  /**
   * The node side follows one page at a time and says so when another takes
   * over. A frozen session has no page to follow, so nothing to listen for.
   */
  private async _listenForPageChange(): Promise<void> {
    try {
      if ((await hostInfo()).snapshot) return;
      const rpc = await litRpc();
      rpc.rpc.register({
        name: 'page-changed',
        type: 'event',
        handler: (event: PageChangedEvent) => {
          // The node dropped its buffer; the panel's own copy describes a
          // page that is no longer followed, on a different clock.
          clearTimelineEvents();
          this._componentsView?.pageChanged();
          // The new page's own announcement may have gone out before it was
          // followed, and been dropped; ask again, so the header can name it.
          sendToPage({type: 'announce', pageId: event.pageId});
          const requested = this._followRequest;
          this._followRequest = null;
          clearTimeout(this._followTimer);
          // A reload of the same tab is not news, and neither is the page
          // the user just asked to follow.
          if (event.reload || event.pageId === requested) {
            this._pageChange = null;
            return;
          }
          this._pageChange = {...event, previous: this._runtime?.location};
        },
      });
    } catch {
      // No client, no notice; the views report their own connection errors.
    }
  }

  /**
   * Tab items for the strip, badging "Components" with the current
   * HMR-incompatibility count and the number of components Lit warned about,
   * each when there is one.
   */
  private get _tabs(): readonly TabItem[] {
    if (this._hmrCount === 0 && this._warningCount === 0) return TABS;
    return TABS.map((t) =>
      t.id === 'components'
        ? {...t, badge: this._hmrCount, warnings: this._warningCount}
        : t
    );
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._locationOff?.();
    this._locationOff = null;
    clearTimeout(this._followTimer);
  }

  private _onTabChange(e: CustomEvent<{value: string}>) {
    this._location.setTab(e.detail.value as DeepLinkTab);
  }

  /**
   * Two sources, one shape: the URL hash the panel opened with (standalone,
   * or a snapshot someone was sent) and the hub activating our dock with
   * params (another devframe, a command, or this plugin's own overlay pick).
   * The location holds a link's selection until its view can show it, so
   * nothing here waits for a view to render.
   */
  override firstUpdated() {
    onDeepLink((link) => this._location.apply(link));
  }

  /**
   * Keep the address bar pointing at what is on screen, so copying it is a
   * link. Only meaningful when someone reads the URL: the panel's own tab, or
   * the page's dock (`?dock`, see `runtime/dock.ts`), which reads the tab
   * off it to reopen there after a page load. Docked in the hub it is an
   * iframe nobody reads the address of, and writing there would be noise.
   */
  private _syncHash(): void {
    const docked = new URLSearchParams(location.search).has('dock');
    if (window.top !== window.self && !docked) return;
    writeHashLink(this._location.link());
  }

  /**
   * A component couldn't be hot-patched in place. Passive badge only — unlike
   * an overlay pick, this must not switch tabs: an incompatibility is
   * not something the developer asked to look at.
   */
  private _onHmrCountChange(e: CustomEvent<{count: number}>) {
    this._hmrCount = e.detail.count;
  }

  /** Lit warned about this many components: a passive badge, no tab switch. */
  private _onWarningCountChange(e: CustomEvent<{count: number}>) {
    this._warningCount = e.detail.count;
  }

  /** The page announced itself (its Lit versions among it), for Settings. */
  private _onRuntimeChange(e: CustomEvent<{runtime: LitRuntimeInfo}>) {
    this._runtime = e.detail.runtime;
  }

  /** An "inspect" link in the timeline or Updates: open Components on it. */
  private _onInspectElement(e: CustomEvent<{id: number}>) {
    this._location.apply({componentId: e.detail.id});
  }

  /** Follow the page the notice says was left; it announces itself again. */
  private _followEarlier(): void {
    const change = this._pageChange;
    if (change === null) return;
    const id = change.previousPageId;
    this._followRequest = id;
    sendToPage({type: 'announce', pageId: id});
    clearTimeout(this._followTimer);
    this._followTimer = setTimeout(() => {
      if (this._followRequest !== id) return;
      // Closed, or reloaded into a new page: nothing answered.
      this._followRequest = null;
      if (this._pageChange?.previousPageId === id) {
        this._pageChange = {...this._pageChange, previousGone: true};
      }
    }, FOLLOW_TIMEOUT_MS);
  }

  /** The followed page's path at the header's far end, title as its tip. */
  private _renderFollowed() {
    const where = this._runtime?.location;
    if (where === undefined || where.path === '') return nothing;
    const tip =
      where.title === '' ? where.path : `${where.title} — ${where.path}`;
    return html`<span class="followed" data-tip=${tip}
      ><span class="sr-only">Following </span>${where.path}</span
    >`;
  }

  private _renderPageChange() {
    const change = this._pageChange;
    if (change === null) return nothing;
    const now = this._runtime?.location?.path;
    const before = change.previous?.path;
    const following = this._followRequest !== null;
    return html`<lit-callout
      class="page-changed"
      variant="neutral"
      size="s"
      role="status"
    >
      <lit-icon slot="icon" name="info"></lit-icon>
      <span>
        Now following ${now ? html`<code>${now}</code>` : 'another page'},
        opened in another tab or frame, since
        ${new Date(change.at).toLocaleTimeString()}. The recording restarted.
        ${
          change.previousGone
            ? html`${before ? html`<code>${before}</code>` : 'The earlier page'}
              is no longer open.`
            : nothing
        }
      </span>
      ${
        change.previousGone
          ? nothing
          : html`<lit-button
              class="follow-earlier"
              variant="neutral"
              appearance="outlined"
              size="s"
              ?loading=${following}
              data-tip="Follow the earlier page again. Its recording can't come back; a new one starts."
              @click=${this._followEarlier}
            >
              <lit-icon slot="start" name="arrow-u-up-left"></lit-icon>
              Follow
              ${before ? html`<code>${before}</code>` : 'the earlier page'}
              again
            </lit-button>`
      }
      <lit-icon-button
        data-tip="Dismiss"
        @click=${() => (this._pageChange = null)}
        icon="x"
        label="Dismiss"
      ></lit-icon-button>
    </lit-callout>`;
  }

  private _renderBrand() {
    const {name, iconUrl} = panelBrand();
    const mark =
      iconUrl === undefined
        ? LIT_LOGO_SVG
        : html`<img src=${iconUrl} width="20" height="20" alt="" />`;
    return html`<span class="brand"
      >${mark} <span class="brand-name">${name}</span></span
    >`;
  }

  override render() {
    if (this.detailsOnly) {
      return html`<div class="view">
        <components-view
          details-only
          .location=${this._location}
        ></components-view>
      </div>`;
    }
    return html`
      <header>
        ${this._renderBrand()}
        <lit-tabs
          .items=${this._tabs}
          .value=${this._location.tab}
          @change=${this._onTabChange}
        ></lit-tabs>
        ${this._renderFollowed()}
      </header>
      ${this._renderPageChange()}
      <div class="view" @inspect-element=${this._onInspectElement}>
        <timeline-view
          ?hidden=${this._location.tab !== 'timeline'}
          .location=${this._location}
        ></timeline-view>
        <!-- Kept mounted (like the timeline) so an overlay inspect-pick can
             arrive and switch us here even while another tab is in front. -->
        <components-view
          ?hidden=${this._location.tab !== 'components'}
          .location=${this._location}
          @hmr-count-change=${this._onHmrCountChange}
          @warning-count-change=${this._onWarningCountChange}
          @runtime-change=${this._onRuntimeChange}
        ></components-view>
        <!-- Mounted lazily: the recording it derives from lives in the
             timeline store and keeps filling whether or not this view exists,
             so there is nothing here to keep alive in the background. -->
        ${
          this._location.tab === 'updates'
            ? html`<updates-view .location=${this._location}></updates-view>`
            : nothing
        }
        ${
          this._location.tab === 'settings'
            ? html`<devtools-settings
                .runtime=${this._runtime}
              ></devtools-settings>`
            : nothing
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'lit-devtools-panel': LitDevtoolsPanel;
  }
}
