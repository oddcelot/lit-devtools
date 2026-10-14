/**
 * The selected component's documentation, from the Custom Elements Manifest
 * the host found for its tag (`component-docs`). Docs are per tag, not per
 * element, so selecting another `<sl-button>` keeps what is already here;
 * selecting a different tag asks again, which also picks up a manifest that
 * was regenerated since. A hot patch of the tag on show asks again too, since
 * docs read from source change with the edit, and so does a regenerated
 * manifest.
 *
 * Kept apart from the inspector stream on purpose: details come from the
 * page, docs from the host's disk, and a host that can't read manifests
 * (the extension, a snapshot) simply never asks.
 */

import type {ComponentDocs} from '../types/component-docs.js';
import {litRpc} from './client.js';

export class ComponentDocsSource {
  #tagName: string | undefined;
  #docs: ComponentDocs | null = null;
  readonly #onChange: () => void;

  /** `onChange` runs when docs for the current tag arrive. */
  constructor(onChange: () => void) {
    this.#onChange = onChange;
  }

  /**
   * The docs for `tagName`, or null while they load and when no manifest
   * describes it. Safe to call from `render()`: the fetch is asynchronous
   * and starts only when the tag changes.
   */
  for(tagName: string): ComponentDocs | null {
    if (tagName !== this.#tagName) {
      this.#tagName = tagName;
      this.#docs = null;
      void this.#fetch(tagName);
    }
    return this.#docs;
  }

  /**
   * Asks again for `tagName` if it is the tag on show, after a hot patch
   * changed its source. The current docs stay up until the answer replaces
   * them, so the pane doesn't flicker.
   */
  refresh(tagName: string): void {
    if (tagName === this.#tagName) void this.#fetch(tagName);
  }

  /** Asks again for the tag on show, after a manifest changed on disk. */
  reload(): void {
    if (this.#tagName !== undefined) void this.#fetch(this.#tagName);
  }

  async #fetch(tagName: string): Promise<void> {
    try {
      const client = await litRpc();
      const {docs} = await client.rpc.call('component-docs', {tagName});
      // A slower answer for a tag the user has since left is dropped.
      if (tagName !== this.#tagName) return;
      this.#docs = docs;
      this.#onChange();
    } catch {
      // No docs is the normal state; the pane shows none.
    }
  }
}
