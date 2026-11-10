import {fromJSON, toJSON} from 'seroval';

/**
 * Page data on its way to the browser, in the HTML and in the router's
 * fetches. seroval's JSON mode, so a `Date`, `Map`, `Set`, `BigInt`,
 * `undefined` or an object reached twice arrives as itself, and hydration
 * renders what the server rendered. It reads back without `eval`.
 *
 * `<` is escaped, so the text can sit in a `<script>` element without
 * closing it.
 */
export const encode = (value: unknown): string =>
  JSON.stringify(toJSON(value)).replaceAll('<', '\\u003c');

export const decode = <T>(text: string): T =>
  fromJSON<T>(JSON.parse(text) as Parameters<typeof fromJSON>[0]);
