import {Database} from 'bun:sqlite';
import type {Entry} from './shared.ts';

export interface Entries {
  /** Newest first. */
  list(limit?: number): Entry[];
  add(input: {name: string; message: string}): Entry;
}

/**
 * The guestbook, in SQLite through `bun:sqlite`. `:memory:` (the default)
 * forgets everything on restart, which is what the tests want.
 */
export const openEntries = (path = ':memory:'): Entries => {
  const db = new Database(path, {create: true, strict: true});
  db.run(`create table if not exists entries (
    id integer primary key autoincrement,
    name text not null,
    message text not null,
    created_at text not null
  )`);

  const select = db.query<Entry, {limit: number}>(
    `select id, name, message, created_at as createdAt
     from entries order by id desc limit $limit`
  );
  const insert = db.query<
    Entry,
    {name: string; message: string; createdAt: string}
  >(
    `insert into entries (name, message, created_at)
     values ($name, $message, $createdAt)
     returning id, name, message, created_at as createdAt`
  );

  return {
    list: (limit = 50) => select.all({limit}),
    add: ({name, message}) =>
      insert.get({
        name: name.trim(),
        message: message.trim(),
        createdAt: new Date().toISOString(),
      })!,
  };
};
