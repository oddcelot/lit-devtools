// Templates Lit reads differently than they're written, and directives where
// Lit can't apply them.
import {html} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {ifDefined} from 'lit/directives/if-defined.js';

const title: string | undefined = undefined;

// unclosed-tag: HTML reads `<x-card />` as an open tag, so the paragraph
// after it becomes the card's child.
export const selfClosed = html`<x-card />
  <p>after</p>`;

// binding-syntax: `.value` sets a property, so its value is an expression.
export const noExpression = html`<input .value="hello" />`;

// binding-syntax: the stray `"` after the expression makes `title` a string.
export const strayQuote = html`<input title=${title}" />`;

// binding-syntax: `class$=` is Polymer's syntax; Lit sets the attribute with
// `class=${…}`.
export const polymer = html`<p class$=${'note'}>note</p>`;

// directive-binding: `classMap` belongs to `class`; anywhere else it throws
// on first render.
export const wrongAttribute = html`<p title=${classMap({on: true})}>x</p>`;

// directive-binding: `ifDefined` is for attributes, not properties.
export const onProperty = html`<input .value=${ifDefined(title)} />`;
