/**
 * The bindings in a document's templates whose whole value is one `${…}`:
 * `.size=${x}`, `?hidden=${x}`, `@go=${x}` and `title=${x}`, quoted or not.
 * A value that mixes text and holes, `class="a ${b}"`, is a string whatever
 * its holes hold, so it isn't one.
 */

import {
  type Binding,
  type DocumentKind,
  type MarkupAttribute,
  type MarkupElement,
  markupRegions,
  scanMarkup,
} from './markup.js';

export interface TemplateBinding {
  element: MarkupElement;
  attribute: MarkupAttribute;
  /** The expression inside `${…}`. */
  start: number;
  end: number;
}

export interface BindingsRequest {
  code: string;
  kind: DocumentKind;
  templateTags?: readonly string[];
}

/** The document's single-hole bindings, or only those of `binding`. */
export const templateBindings = (
  {code, kind, templateTags}: BindingsRequest,
  binding?: Binding
): TemplateBinding[] =>
  markupRegions(code, kind, {templateTags}).flatMap((region) =>
    scanMarkup(code, region).flatMap((element) =>
      element.attributes.flatMap((attribute) => {
        const value = attribute.value;
        if (binding !== undefined && attribute.binding !== binding) return [];
        if (!value?.expression) return [];
        const whole = region.holes.some(
          (hole) => hole.start === value.start && hole.end === value.end
        );
        if (!whole || !code.startsWith('${', value.start)) return [];
        if (code[value.end - 1] !== '}') return [];
        return [
          {element, attribute, start: value.start + 2, end: value.end - 1},
        ];
      })
    )
  );
