/**
 * The Astro renderer's server half: what Astro calls to render a Lit
 * element, written as a tag in a page (`<my-card>`) or used as an imported
 * class (`<MyCard client:load />`). It renders the element with
 * `@lit-labs/ssr` into a declarative shadow root, its props split into
 * attributes and properties (`props.ts`), and its named slots assigned
 * (`slots.ts`).
 *
 * Loaded by Astro through Vite's SSR module graph, so the plugin's own
 * server-side handling applies: `?css-sheet` imports render their css into
 * the shadow root, and in dev an edited component's next definition
 * replaces the old one instead of throwing.
 */

import {LitElementRenderer} from '@lit-labs/ssr';
import {collectResult} from '@lit-labs/ssr/lib/render-result.js';
import {assignSlot} from './slots.js';
import {
  PROPS_ATTRIBUTE,
  type PropertyDeclarations,
  type SplitProps,
  encodeProperties,
  splitProps,
} from './props.js';

/** The slice of Astro's `AstroComponentMetadata` the renderer reads. */
interface Metadata {
  /** The island's directive; absent for an element no island wraps. */
  hydrate?: string;
}

type LitClass = PropertyDeclarations & {_$litElement$?: boolean};

const registry = (): CustomElementRegistry | undefined =>
  (globalThis as {customElements?: CustomElementRegistry}).customElements;

/** A tag string names itself, when it can name a custom element. */
const tagOfString = (tag: string): string | undefined =>
  tag.includes('-') ? tag : undefined;

/** A class names the tag the registry defined it as. */
const tagOfClass = (ctor: CustomElementConstructor): string | undefined =>
  registry()?.getName(ctor) ?? undefined;

/** The tag a component names: itself, or the tag its class is defined as. */
const tagOf = (component: unknown): string | undefined =>
  typeof component === 'string'
    ? tagOfString(component)
    : typeof component === 'function'
      ? tagOfClass(component as CustomElementConstructor)
      : undefined;

const classOf = (tag: string): LitClass | undefined =>
  registry()?.get(tag) as LitClass | undefined;

const check = async (component: unknown): Promise<boolean> => {
  const tag = tagOf(component);
  return tag !== undefined && classOf(tag)?._$litElement$ === true;
};

const escapeAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

/** The element's server instance, with its props set and connected. */
const instanceOf = (tag: string, {attributes, properties}: SplitProps) => {
  const element = new LitElementRenderer(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  for (const [name, value] of Object.entries(properties)) {
    element.setProperty(name, value);
  }
  element.connectedCallback();
  return element;
};

/** The properties for the browser, warning about what they leave out. */
const carried = (tag: string, properties: Record<string, unknown>): string => {
  const {json, dropped} = encodeProperties(properties);
  if (dropped.length > 0) {
    console.warn(
      `[lit-plugin] <${tag}> got ${dropped.map((d) => `\`${d}\``).join(', ')} ` +
        `as a function, symbol or class instance, which the HTML can't ` +
        `carry, so the browser won't have it. Set it from a page script ` +
        `once the element is defined.`
    );
  }
  return json;
};

/**
 * Properties don't survive in the HTML: hold the element back until the
 * browser has set them again. An island's come from Astro's props; any
 * other element's ride along in the marker.
 */
const deferral = (
  tag: string,
  properties: Record<string, unknown>,
  metadata?: Metadata
): string => {
  if (Object.keys(properties).length === 0) return '';
  const json = metadata?.hydrate === undefined ? carried(tag, properties) : '';
  return ` defer-hydration ${PROPS_ATTRIBUTE}="${escapeAttribute(json)}"`;
};

/** The element's declarative shadow root, if it renders one. */
const shadowRootOf = async (element: LitElementRenderer): Promise<string> => {
  const shadow = element.renderShadow({
    elementRenderers: [LitElementRenderer],
    customElementInstanceStack: [element],
    customElementHostStack: [element],
    eventTargetStack: [element.element],
    slotStack: [],
    deferHydration: false,
  });
  if (shadow === undefined) return '';
  const {mode, delegatesFocus} = element.shadowRootOptions;
  const focus = delegatesFocus ? ' shadowrootdelegatesfocus' : '';
  return `<template shadowrootmode="${mode}"${focus}>${await collectResult(shadow)}</template>`;
};

/** The light DOM children: the default slot as is, named ones assigned. */
const lightDom = (slots: Record<string, string | undefined> = {}): string =>
  Object.entries(slots)
    .map(([name, content = '']) =>
      name === 'default' ? content : assignSlot(content, name)
    )
    .join('');

const renderToStaticMarkup = async (
  component: unknown,
  props: Record<string, unknown> = {},
  slots?: Record<string, string | undefined>,
  metadata?: Metadata
): Promise<{html: string}> => {
  const tag = tagOf(component)!;
  const split = splitProps(classOf(tag) ?? {}, props);
  const element = instanceOf(tag, split);
  const attributes = await collectResult(element.renderAttributes());
  const html =
    `<${tag}${deferral(tag, split.properties, metadata)}${attributes}>` +
    (await shadowRootOf(element)) +
    lightDom(slots) +
    `</${tag}>`;
  return {html};
};

export default {
  name: 'lit',
  check,
  renderToStaticMarkup,
};
