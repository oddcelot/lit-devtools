// Names nothing defines. Each problem names what you probably meant.
import {html} from 'lit';

// unknown-element: `<x-buton>` isn't HTML, SVG or a component this file can
// use. Did you mean `<x-button>`?
export const tag = html`<x-buton>Press</x-buton>`;

// unknown-attribute: `<x-button>` has no attribute `sise`. Did you mean
// `size`?
export const attribute = html`<x-button sise="large">Press</x-button>`;

// unknown-binding: `<x-button>` has no property `.sizes`. Did you mean
// `.size`?
export const property = html`<x-button .sizes=${'large'}>Press</x-button>`;

// invalid-value: `size` takes one of `small`, `large`, not `huge`.
export const value = html`<x-button size="huge">Press</x-button>`;

// unknown-slot: `<x-card>` has no slot `heder`. Did you mean `header`?
export const slot = html`<x-card><h2 slot="heder">Title</h2></x-card>`;
