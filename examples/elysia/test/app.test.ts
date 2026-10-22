import {treaty} from '@elysia/eden';
import {describe, expect, it} from 'bun:test';
import {createApp} from '../src/app.ts';
import {openEntries} from '../src/entries.ts';

/** A fresh app on an in-memory database, called without a network. */
const setup = () => {
  const entries = openEntries();
  const app = createApp({
    entries,
    assets: {
      script: '/assets/entry.js',
      serve: (path) =>
        path === 'entry.js' ? new Response('// client') : undefined,
    },
  });
  return {app, entries, api: treaty(app)};
};

const page = async (app: ReturnType<typeof setup>['app'], path = '/') =>
  (await app.handle(new Request(`http://localhost${path}`))).text();

describe('the page', () => {
  it('renders every region with declarative shadow roots', async () => {
    const {app, entries} = setup();
    entries.add({name: 'Ada', message: 'Hello <b>there</b>'});
    const html = await page(app);

    expect(html).toContain('<header id="masthead">');
    expect(html).toContain('<section id="sign">');
    expect(html).toContain('<section id="book">');
    expect(html).toMatch(
      /<guest-book[^>]*><template[^>]*shadowrootmode="open"/
    );
    // Text is escaped by Lit, and the hydration data cannot close its script.
    expect(html).toContain('Hello &lt;b&gt;there&lt;/b&gt;');
    expect(html).toContain('Hello \\u003cb>there\\u003c/b>');
  });

  it('keeps the form waiting for the reader', async () => {
    const {app} = setup();
    expect(await page(app)).toMatch(/<sign-form[^>]*defer-hydration/);
  });

  it('shows times in UTC, since the reader’s clock is unknown', async () => {
    const {app, entries} = setup();
    entries.add({name: 'Ada', message: 'Hi'});
    expect(await page(app)).toMatch(/\d{4} at \d{2}:\d{2} UTC/);
  });

  it('streams the head before the body', async () => {
    const {app} = setup();
    const response = await app.handle(new Request('http://localhost/'));
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('<script type="module" src="/assets/entry.js">');
    expect(first).not.toContain('<guest-book');
    await reader.cancel();
  });

  it('loads a standalone DevTools runtime first when given one', async () => {
    const entries = openEntries();
    const app = createApp({
      entries,
      assets: {script: '/assets/entry.js', serve: () => undefined},
      devtools: 'http://localhost:5180/lit-devtools.js',
    });
    const html = await page(app);
    expect(html.indexOf('lit-devtools.js')).toBeLessThan(
      html.indexOf('/assets/entry.js')
    );
  });
});

describe('an entry’s page', () => {
  it('links every signature in the book to its page', async () => {
    const {app, entries} = setup();
    const {id} = entries.add({name: 'Ada', message: 'Hi'});
    expect(await page(app)).toContain(`<a href="/entries/${id}">`);
  });

  it('renders one signature, titled with its name', async () => {
    const {app, entries} = setup();
    const {id} = entries.add({name: 'Ada <3', message: 'Hello'});
    const html = await page(app, `/entries/${id}`);
    expect(html).toContain('<title>Ada &#60;3 · Guestbook</title>');
    expect(html).toContain('<section id="entry">');
    expect(html).toMatch(/<guest-entry[^>]*><template[^>]*shadowrootmode/);
    // No form here, and the page data says which page this is.
    expect(html).not.toContain('<sign-form');
    expect(html).toContain('"page":"entry"');
  });

  it('links to the signatures either side', async () => {
    const {app, entries} = setup();
    const first = entries.add({name: 'A', message: '1'});
    const middle = entries.add({name: 'B', message: '2'});
    const last = entries.add({name: 'C', message: '3'});

    const html = await page(app, `/entries/${middle.id}`);
    expect(html).toContain(`href="/entries/${first.id}"`);
    expect(html).toContain(`href="/entries/${last.id}"`);

    const oldest = await page(app, `/entries/${first.id}`);
    expect(oldest).not.toContain('rel="prev"');
    expect(oldest).toContain('rel="next"');
  });

  it('answers 404 for a signature that does not exist', async () => {
    const {app} = setup();
    const missing = await app.handle(new Request('http://localhost/entries/9'));
    const garbage = await app.handle(
      new Request('http://localhost/entries/nope')
    );
    expect(missing.status).toBe(404);
    expect(garbage.status).toBe(404);
  });
});

describe('the API', () => {
  it('adds an entry and lists it first', async () => {
    const {api} = setup();
    await api.api.entries.post({name: 'Ada', message: 'First'});
    const {data: added} = await api.api.entries.post({
      name: '  Grace ',
      message: 'Second',
    });
    expect(added?.name).toBe('Grace');

    const {data} = await api.api.entries.get();
    expect(data?.map((entry) => entry.name)).toEqual(['Grace', 'Ada']);
  });

  it('refuses a name of only spaces', async () => {
    const {api} = setup();
    const {error} = await api.api.entries.post({name: '   ', message: 'Hi'});
    expect(error?.status).toBe(422);
  });

  it('refuses a message over the limit', async () => {
    const {api} = setup();
    const {error} = await api.api.entries.post({
      name: 'Ada',
      message: 'x'.repeat(281),
    });
    expect(error?.status).toBe(422);
  });
});

describe('the form without JavaScript', () => {
  const post = (app: ReturnType<typeof setup>['app'], body: string) =>
    app.handle(
      new Request('http://localhost/sign', {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body,
      })
    );

  it('signs and redirects back', async () => {
    const {app, entries} = setup();
    const response = await post(app, 'name=Ada&message=Hello');
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(entries.list()[0]?.name).toBe('Ada');
  });

  it('redirects with an error the page shows', async () => {
    const {app, entries} = setup();
    const response = await post(app, 'name=+&message=Hello');
    expect(response.headers.get('location')).toBe('/?error=invalid');
    expect(entries.list()).toHaveLength(0);
    expect(await page(app, '/?error=invalid')).toContain(
      'error="Both a name and a message, please."'
    );
  });
});

describe('assets', () => {
  it('serves what the assets know, and 404s the rest', async () => {
    const {app} = setup();
    const ok = await app.handle(
      new Request('http://localhost/assets/entry.js')
    );
    const missing = await app.handle(
      new Request('http://localhost/assets/nope.js')
    );
    expect(ok.status).toBe(200);
    expect(missing.status).toBe(404);
  });
});
