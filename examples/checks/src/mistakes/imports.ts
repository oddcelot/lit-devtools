// missing-import: `<x-badge>` is defined in `x-badge.ts`, which neither this
// file nor src/main.ts (listed in `entries`) imports, so the tag may be
// undefined when it renders. The quick fix adds the import.
import {html} from 'lit';

export const badge = html`<x-badge .count=${3}></x-badge>`;
