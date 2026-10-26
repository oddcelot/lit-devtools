// The same mistakes, silenced with a comment, in the editor, in Oxlint and in
// `npm run check`. Nothing in this file is reported.
import {html} from 'lit';

const label: string = 'large';

// A template comment covers the next element: its tag, attributes and
// values. Name the rules, or none for all of them.
export const legacy = html`
  <!-- lit-ignore unknown-attribute -->
  <x-button colour="red">Press</x-button>
`;

// lit-ignore-next-line binding-type
export const unchecked = html`<x-button .size=${label}>Press</x-button>`;
