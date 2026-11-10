import {route} from '@oddsquad/lit-elysia/routes';

// `visitor` and `site` come from the `context` plugin in src/server.ts,
// typed; `cookie` and `redirect` are Elysia's own.
export const load = route('/visitor').load(({visitor, site, query}) => ({
  visitor,
  site: site.name,
  from: query['from'],
}));

type Cookies = Record<string, {value: unknown; remove(): void} | undefined>;

/** Keeps the name in a cookie, or forgets it for an empty one. */
const remember = (cookie: Cookies, name: string) => {
  if (name) cookie['visitor']!.value = name;
  else cookie['visitor']?.remove();
};

/** The posted name, trimmed; empty when there is none. */
const nameFrom = (body: Record<string, unknown>) =>
  typeof body['name'] === 'string' ? body['name'].trim() : '';

export const actions = route('/visitor').actions({
  // A redirect after saving: the next request carries the new cookie, so
  // its load derives the new visitor.
  default: ({body, cookie, query, redirect}) => {
    const name = nameFrom(body);
    remember(cookie as unknown as Cookies, name);
    return redirect(
      name && query['from'] === 'private' ? '/private' : '/visitor',
      303
    );
  },
});
