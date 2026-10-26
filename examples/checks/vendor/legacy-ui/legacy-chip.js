// A component from a library that ships no Custom Elements Manifest, as
// many older ones don't. Without the manifest next to it, listed in the
// `manifests` setting, the editor would report <legacy-chip> as unknown.
class LegacyChip extends HTMLElement {
  static observedAttributes = ['tone'];

  constructor() {
    super();
    this.attachShadow({mode: 'open'}).innerHTML = `
      <style>
        :host { display: inline-block; padding: 0.1em 0.6em; border-radius: 999px; background: #e5e7eb; }
        :host([tone='warm']) { background: #fde68a; }
        :host([tone='cool']) { background: #bfdbfe; }
      </style>
      <slot></slot>`;
  }
}

customElements.define('legacy-chip', LegacyChip);
