import {treaty} from '@elysia/eden';
import type {App} from '../app.ts';

let client: ReturnType<typeof treaty<App>> | undefined;

/**
 * The server's routes as typed calls, through Eden Treaty: `App` is the
 * Elysia instance's type, so a renamed route or a changed body fails the
 * type check here. Made on first use, because components that import this
 * are also rendered on the server, where there is no `location`.
 */
export const api = () => (client ??= treaty<App>(location.origin));
