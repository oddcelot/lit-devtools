import type {ReactiveController, ReactiveControllerHost} from 'lit';

/**
 * Counts a component's renders into its `.renders` badge, so an edit shows
 * whether it re-rendered (the count goes up) or only restyled (it stays).
 */
export class RenderCount implements ReactiveController {
  #host: ReactiveControllerHost & HTMLElement;
  #renders = 0;

  constructor(host: ReactiveControllerHost & HTMLElement) {
    this.#host = host;
    host.addController(this);
  }

  hostUpdated() {
    this.#renders++;
    const badge = this.#host.shadowRoot?.querySelector('.renders');
    if (badge) {
      badge.textContent = `renders: ${this.#renders}`;
    }
  }
}
