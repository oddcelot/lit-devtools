/**
 * The Astro renderer's client half: what an `<astro-island>` calls once its
 * directive fires. For a server-rendered element it sets the props the HTML
 * couldn't carry, then lets the element hydrate; for `client:only` there is
 * no HTML, so it creates the element.
 */

import {PROPS_ATTRIBUTE, splitProps} from './props.js';
import {release} from './release.js';
import {assignSlot} from './slots.js';

type LitClass = CustomElementConstructor & {
  elementProperties?: ReadonlyMap<PropertyKey, {attribute?: boolean | string}>;
};

/**
 * The tag a class is defined as. Safari before 17 has no `getName()`; the
 * plugin's dev runtime puts one in, and a build constructs the class,
 * which is then the registered one.
 */
const tagOf = (component: LitClass): string | null => {
  const registry = customElements as {
    getName?: CustomElementRegistry['getName'];
  };
  return registry.getName?.call(customElements, component) ?? null;
};

/**
 * The element a component names, created by tag, not `new`: in dev the
 * class an island imports can be a later version of the registered one,
 * which can't be constructed itself.
 */
const elementFor = (component: LitClass | string): HTMLElement => {
  const tag = typeof component === 'string' ? component : tagOf(component);
  return tag === null
    ? new (component as LitClass)()
    : document.createElement(tag);
};

/** A `client:only` element: no server HTML, so everything is set here. */
const create = (
  component: LitClass | string,
  props: Record<string, unknown>,
  slots: Record<string, string>
): HTMLElement => {
  const element = elementFor(component);
  const {attributes, properties} = splitProps(
    element.constructor as LitClass,
    props
  );
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  Object.assign(element, properties);
  element.innerHTML = Object.entries(slots)
    .map(([name, html]) => (name === 'default' ? html : assignSlot(html, name)))
    .join('');
  return element;
};

/** A server-rendered element: set what the HTML couldn't carry, release it. */
const resume = (island: HTMLElement, props: Record<string, unknown>): void => {
  const element = island.firstElementChild as HTMLElement | null;
  if (element?.hasAttribute(PROPS_ATTRIBUTE) !== true) return;
  const {properties} = splitProps(element.constructor as LitClass, props);
  release(element, properties);
};

export default (island: HTMLElement) =>
  async (
    component: LitClass | string,
    props: Record<string, unknown>,
    slots: Record<string, string>,
    {client}: {client: string}
  ): Promise<void> => {
    if (client === 'only') island.append(create(component, props, slots));
    else resume(island, props);
  };
