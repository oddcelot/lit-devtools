import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import {type Fixture, type PanelHandle, startFixture} from './utils.js';

/**
 * The real, built DevTools panel (`dist/client`) in a real browser. Unit and
 * jsdom-free checks can't see layout, so this is where "the rows are as wide
 * as the list" and "Clear leaves the empty state in view" are decided.
 */

let fixture: Fixture;
let panel: PanelHandle;

beforeAll(async () => {
  fixture = await startFixture({plugin: {timeline: true}, panel: true});
  // The playground clocks render every second, which would put events in the
  // timeline that no test asked for: a Clear that does not stay empty, a list
  // that grows between two reads. Nothing here is about them.
  await fixture.page.evaluate(() => {
    for (const clock of document.querySelectorAll(
      'hmr-clock, hmr-digital-clock'
    )) {
      clock.remove();
    }
  });
  panel = await fixture.openPanel();
  await panel.page.goto(`${fixture.origin}/__lit/#tab=timeline`);
  // These read the list; the Timeline opens in Tracks.
  await panel.page.evaluate(() =>
    localStorage.setItem('lit-devtools-timeline-mode', 'list')
  );
  await panel.page.reload();
  await panel.page.waitForSelector('timeline-view');
});

afterAll(async () => {
  await fixture?.close();
});

test('the panel loads without console errors', async () => {
  // Let the RPC connection and first renders settle before judging.
  await panel.page.waitForSelector('timeline-event-list');
  expect(panel.errors).toEqual([]);
});

test('timeline rows span the full width of the list', async () => {
  const {page} = panel;
  // Recording is off until asked for; interact with the app to make events.
  await page.getByRole('button', {name: /Record/}).click();
  await fixture.page.locator('hmr-counter #increment').click();
  await page.locator('timeline-event-list .row').first().waitFor();

  // Locators pierce the panel's nested shadow roots; a hand-written
  // querySelector chain would not.
  const scroll = (await page
    .locator('timeline-event-list .scroll')
    .boundingBox())!;
  const widths = {
    scroll: scroll.width,
    rows: await page
      .locator('timeline-event-list .row')
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().width)
      ),
  };
  expect(widths.rows.length).toBeGreaterThan(0);
  for (const width of widths.rows) {
    expect(width).toBeGreaterThanOrEqual(widths.scroll - 1);
  }
});

test('Clear leaves the empty state in view', async () => {
  const {page} = panel;
  // The original bug needs a list tall enough to scroll, scrolled away from
  // the top: the virtualizer leaves its host sized to the old content.
  const scroller = page.locator('timeline-event-list .scroll');
  const increment = fixture.page.locator('hmr-counter #increment');
  for (let i = 0; i < 60; i++) {
    await increment.click();
  }
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(500);
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await page.getByRole('button', {name: 'Clear'}).click();
  const empty = page.locator('timeline-event-list .empty');
  await empty.waitFor();
  expect(await empty.textContent()).toContain('No events yet');
  // Inside the viewport, not merely present: a virtualizer-sized scroller
  // once pushed it thousands of px out of sight.
  const box = (await empty.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(panel.errors).toEqual([]);
});

test('a #event= link selects the span it names', async () => {
  const {page} = panel;
  const increment = fixture.page.locator('hmr-counter #increment');
  for (let i = 0; i < 30; i++) {
    await increment.click();
  }
  const rows = page.locator('timeline-event-list .row');
  await rows.first().waitFor();

  // Selecting a row writes its start event's id into the hash.
  await rows.first().click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain('event=');
  const hash = await page.evaluate(() => location.hash);
  const selected = page.locator('timeline-event-list .row.selected');
  const linkedText = await selected.textContent();

  // Move the selection elsewhere, then follow the link back.
  await rows.last().click();
  expect(await selected.textContent()).not.toBe(linkedText);
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await expect.poll(() => selected.textContent()).toBe(linkedText);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  // Scrolled into view, not merely selected.
  const box = (await selected.boundingBox())!;
  const list = (await page
    .locator('timeline-event-list .scroll')
    .boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(list.y - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(list.y + list.height + 1);
  expect(panel.errors).toEqual([]);
});

test('a #event= link to a row folded into an update opens it and scrolls to it', async () => {
  const {page} = panel;
  // A few updates of our own; the list is long already from the tests
  // above.
  const increment = fixture.page.locator('hmr-counter #increment');
  for (let i = 0; i < 3; i++) {
    await increment.click();
  }
  const rows = page.locator('timeline-event-list .row');
  await rows.first().waitFor();
  const open = page.locator(
    'timeline-event-list button.twisty[aria-expanded="true"]'
  );

  // Open the first update in view, select a phase inside it, keep its link.
  await page
    .locator('timeline-event-list button.twisty[aria-expanded="false"]')
    .first()
    .click();
  await page.locator('timeline-event-list .row.nested').first().click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain('event=');
  const hash = await page.evaluate(() => location.hash);
  const selected = page.locator('timeline-event-list .row.selected');
  const linkedText = await selected.textContent();

  // Fold it away and go to the far end of the list, so following the link
  // has to open the update again and scroll back to it.
  await open.first().click();
  await expect.poll(() => open.count()).toBe(0);
  await rows.last().click();
  await page
    .locator('timeline-event-list .scroll')
    .evaluate((el) => el.scrollTo({top: el.scrollHeight}));
  expect(await selected.textContent()).not.toBe(linkedText);

  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await expect.poll(() => selected.textContent()).toBe(linkedText);
  expect(await selected.evaluate((el) => el.classList.contains('nested'))).toBe(
    true
  );
  await expect.poll(() => open.count()).toBe(1);
  // In view, not merely selected.
  const box = (await selected.boundingBox())!;
  const list = (await page
    .locator('timeline-event-list .scroll')
    .boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(list.y - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(list.y + list.height + 1);

  // Fold it again: the tests after this one read the list collapsed.
  await open.first().click();
  await expect.poll(() => open.count()).toBe(0);
  expect(panel.errors).toEqual([]);
});

test('a #event= link to an unknown id leaves nothing selected', async () => {
  const {page} = panel;
  const selected = page.locator('timeline-event-list .row.selected');
  await selected.waitFor();
  await page.evaluate(() => {
    location.hash = '#tab=timeline&event=gone-0';
  });
  await expect.poll(() => selected.count()).toBe(0);
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .not.toContain('event=');
  expect(panel.errors).toEqual([]);
});

test('a reloaded panel lists the events recorded before it reloaded', async () => {
  const {page} = panel;
  // Start from an empty list: the dev server replays only its last 512
  // events, and the tests above can leave more than that behind.
  await page.getByRole('button', {name: 'Clear'}).click();
  await page.locator('timeline-event-list .empty').waitFor();
  const increment = fixture.page.locator('hmr-counter #increment');
  for (let i = 0; i < 5; i++) {
    await increment.click();
  }
  const rows = page.locator('timeline-event-list .row');
  await rows.first().waitFor();

  // Select a row so the hash carries a link to one of the recorded spans.
  await rows.first().click();
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain('event=');
  const hash = await page.evaluate(() => location.hash);
  const linkedText = await page
    .locator('timeline-event-list .row.selected')
    .textContent();
  // The list is virtualized, so the DOM row count says little; the scroll
  // height is the whole list's size. Let the last batch land before reading:
  // a fixed wait was too short on a loaded CI runner, so wait for the height
  // to hold still across a few reads.
  const scroller = page.locator('timeline-event-list .scroll');
  const height = () => scroller.evaluate((el) => el.scrollHeight);
  let before = -1;
  await expect
    .poll(
      async () => {
        const previous = before;
        before = await height();
        return before === previous;
      },
      {interval: 300, timeout: 5000}
    )
    .toBe(true);
  expect(before).toBeGreaterThan(0);

  // No clicks from here on: whatever the reloaded panel shows can only have
  // come from the node side's history.
  await page.reload();
  await page.waitForSelector('timeline-event-list');
  // Same size as before: nothing lost to the reload, nothing doubled up by
  // the replay.
  await expect.poll(height).toBe(before);

  // The cold link resolves against the seeded events.
  const selected = page.locator('timeline-event-list .row.selected');
  await expect.poll(() => selected.textContent()).toBe(linkedText);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  expect(panel.errors).toEqual([]);
});

test('new events follow the list only when it is scrolled to the end', async () => {
  const {page} = panel;
  const increment = fixture.page.locator('hmr-counter #increment');
  const scroller = page.locator('timeline-event-list .scroll');
  const height = () => scroller.evaluate((el) => el.scrollHeight);
  const fromEnd = () =>
    scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  for (let i = 0; i < 20; i++) {
    await increment.click();
  }
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(500);

  // Scrolled up to read: new events leave the reader where they are.
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  let grown = await height();
  await increment.click();
  await expect.poll(height).toBeGreaterThan(grown);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);

  // At the end: the list keeps up with them.
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(fromEnd).toBeLessThan(2);
  grown = await height();
  await increment.click();
  await expect.poll(height).toBeGreaterThan(grown);
  await expect.poll(fromEnd).toBeLessThan(2);
  expect(panel.errors).toEqual([]);
});

test('the regex filter narrows the tracks as well as the list', async () => {
  const {page} = panel;
  const increment = fixture.page.locator('hmr-counter #increment');
  for (let i = 0; i < 3; i++) {
    await increment.click();
  }
  await page.getByText('Tracks', {exact: true}).first().click();
  const marks = page.locator('timeline-tracks .mark');
  await expect.poll(() => marks.count()).toBeGreaterThan(0);

  // The filter bar stays on screen in Tracks mode.
  const regex = page.locator('timeline-view lit-input.regex input');
  await regex.fill('^no-such-span$');
  await expect.poll(() => marks.count()).toBe(0);

  await regex.fill('');
  await expect.poll(() => marks.count()).toBeGreaterThan(0);
  expect(panel.errors).toEqual([]);
});

test('a filter that hides the selected mark keeps its detail in Tracks', async () => {
  const {page} = panel;
  await fixture.page.locator('hmr-counter #increment').click();
  await page.getByText('Tracks', {exact: true}).first().click();
  const marks = page.locator('timeline-tracks .mark');
  await expect.poll(() => marks.count()).toBeGreaterThan(0);

  const detail = page.locator('timeline-tracks timeline-span-detail');
  await marks.first().click();
  await detail.waitFor();

  await page
    .locator('timeline-view lit-input.regex input')
    .fill('^no-such-span$');
  await expect.poll(() => marks.count()).toBe(0);
  expect(await detail.count()).toBe(1);
  expect(panel.errors).toEqual([]);
});

test('Shift+drag selects a range in Tracks and summarises it', async () => {
  const {page} = panel;
  // The previous test leaves its regex in the shared filter.
  await page.locator('timeline-view lit-input.regex input').fill('');
  await fixture.page.locator('hmr-counter #increment').click();
  await page.getByText('Tracks', {exact: true}).first().click();
  await expect
    .poll(() => page.locator('timeline-tracks .mark').count())
    .toBeGreaterThan(0);

  const ticks = (await page.locator('timeline-tracks .ticks').boundingBox())!;
  const lanes = (await page.locator('timeline-tracks .lanes').boundingBox())!;
  const y = lanes.y + 6;
  await page.keyboard.down('Shift');
  await page.mouse.move(ticks.x + 4, y);
  await page.mouse.down();
  await page.mouse.move(ticks.x + ticks.width - 4, y, {steps: 8});
  // The bounds are on screen while dragging.
  await page.locator('timeline-tracks .range-label').waitFor();
  await page.mouse.up();
  await page.keyboard.up('Shift');

  const summary = page.locator('timeline-tracks timeline-range-summary');
  await summary.waitFor();
  expect(await page.locator('timeline-tracks .range').count()).toBe(1);

  // The edges are sliders: keys and a drag adjust them.
  const end = page.locator('timeline-tracks [aria-label="Range end"]');
  const before = Number(await end.getAttribute('aria-valuenow'));
  await end.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => Number(await end.getAttribute('aria-valuenow')))
    .toBeLessThan(before);
  const start = page.locator('timeline-tracks [aria-label="Range start"]');
  const startBefore = Number(await start.getAttribute('aria-valuenow'));
  const box = (await start.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, lanes.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, lanes.y + 6, {steps: 4});
  await page.mouse.up();
  await expect
    .poll(async () => Number(await start.getAttribute('aria-valuenow')))
    .toBeGreaterThan(startBefore);

  // Filter to range hands the window to the shared filter...
  await summary.getByText('Filter to range').click();
  await page.locator('timeline-view .range-chip').waitFor();
  // ...and Esc clears the selection, the chip the filter.
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.locator('timeline-tracks .range').count())
    .toBe(0);
  await page.locator('timeline-view .range-chip').click();
  await expect
    .poll(() => page.locator('timeline-view .range-chip').count())
    .toBe(0);

  // A drag on the ruler draws one too, and a click there clears it.
  await page.mouse.move(ticks.x + 10, ticks.y + 8);
  await page.mouse.down();
  await page.mouse.move(ticks.x + 200, ticks.y + 8, {steps: 8});
  await page.mouse.up();
  await page.locator('timeline-tracks .range').waitFor();
  await page.mouse.click(ticks.x + 300, ticks.y + 8);
  await expect
    .poll(() => page.locator('timeline-tracks .range').count())
    .toBe(0);
  expect(panel.errors).toEqual([]);
});

test('the Tracks ruler spans the same width as every lane plot', async () => {
  const {page} = panel;
  await page.waitForSelector('timeline-view');
  // Recording may already be on from an earlier test.
  const record = page.getByRole('button', {name: /Record/});
  if ((await record.count()) > 0) await record.click();
  await fixture.page.locator('hmr-counter #increment').click();
  await page.getByText('Tracks', {exact: true}).first().click();
  // An earlier test may have left a regex that hides every mark.
  const regex = page.locator('timeline-view lit-input.regex input');
  if ((await regex.count()) > 0) await regex.fill('');
  await page.locator('timeline-tracks .mark').first().waitFor();
  const ticks = (await page.locator('timeline-tracks .ticks').boundingBox())!;
  const edges = await page
    .locator('timeline-tracks .plot')
    .evaluateAll((plots) =>
      // A plot's own scrollbar is inside its box: compare the content width.
      plots.map((p) => [
        p.getBoundingClientRect().left,
        p.getBoundingClientRect().left + p.clientWidth,
      ])
    );
  for (const [left, right] of edges as number[][]) {
    expect(Math.abs(left - ticks.x)).toBeLessThan(1);
    expect(Math.abs(right - (ticks.x + ticks.width))).toBeLessThan(1);
  }
  expect(panel.errors).toEqual([]);
});

test('Pick is not offered when the source overlay is off', async () => {
  const {page} = panel;
  await page.goto(`${fixture.origin}/__lit/#tab=components`);
  await page.locator('components-view lit-button.flash').waitFor();
  // `get-meta` arrives after the toolbar first renders; give it the time.
  await page.waitForTimeout(500);
  expect(
    await page.locator('components-view lit-icon-button.pick').count()
  ).toBe(0);
});

test('the selection is the same element after the page reloads', async () => {
  const {page} = panel;
  await page.goto(`${fixture.origin}/__lit/#tab=components`);
  await page.locator('components-view lit-button.flash').waitFor();
  const idOf = (tag: string) =>
    fixture.page.evaluate(
      `globalThis[Symbol.for('@oddsquad/vite-plugin-lit#lit-id-of')](document.querySelector('${tag}'))`
    );
  const id = (await idOf('hmr-properties')) as number;
  await page.evaluate(
    (id) =>
      (
        document
          .querySelector('lit-devtools-panel')!
          .shadowRoot!.querySelector('components-view') as unknown as {
          location: {apply: (l: {componentId: number}) => void};
        }
      ).location.apply({componentId: id}),
    id
  );
  const heading = page.locator('components-view .details h2').first();
  await expect.poll(() => heading.textContent()).toContain('hmr-properties');

  // The reloaded page mints its ids back to front, as the timeline can when
  // elements first update in an order of their own: the old id now names
  // another element, and only the element's key finds it again.
  await fixture.page.addInitScript(() => {
    const key = Symbol.for('@oddsquad/vite-plugin-lit#lit-id-of');
    let idOf: ((el: Element) => number) | undefined;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get: () => idOf,
      set: (fn: (el: Element) => number) => {
        idOf = fn;
        for (const el of [...document.querySelectorAll('*')].reverse()) fn(el);
      },
    });
  });
  await fixture.page.reload();
  expect(await idOf('hmr-properties')).not.toBe(id);
  await expect
    .poll(() => heading.textContent(), {timeout: 10_000})
    .toContain('hmr-properties');
  expect(panel.errors).toEqual([]);
});
