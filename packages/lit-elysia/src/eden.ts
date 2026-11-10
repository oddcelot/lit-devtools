import {treaty, type Treaty} from '@elysia/eden/treaty2';
import type {AnyElysia} from 'elysia';
import type {Register} from './routes-types.ts';

/** The app `src/server.ts` exports by default, once the list registers it. */
type App = Register extends {app: infer A extends AnyElysia} ? A : AnyElysia;

let client: Treaty.Instance<App> | undefined;

/**
 * An Eden Treaty client for the app `src/server.ts` exports, typed from its
 * routes: `await api.api.notes.post({title, body})`. A renamed route or a
 * changed body fails the type check where it is called.
 *
 * For components, in the browser, against the page's own origin: it is
 * made the first time it is used, so importing it from a page the server
 * renders costs nothing. On the server, a load calls the code itself.
 */
export const api: Treaty.Instance<App> = new Proxy({} as Treaty.Instance<App>, {
  get: (_, key) => Reflect.get(clientOf(), key),
});

const clientOf = () => {
  if (typeof location === 'undefined') {
    throw new Error(
      `[lit-elysia] api is the browser's client: in a load, call the code it would reach.`
    );
  }
  return (client ??= treaty<App>(location.origin));
};
