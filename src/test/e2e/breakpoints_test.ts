/**
 * Breakpoints in a real page, set through the runtime's global the way the
 * extension's `inspectedWindow.eval` sets them, with the debugger attached
 * over CDP standing in for the open DevTools.
 */

import {afterAll, beforeAll, expect, test} from 'vite-plus/test';
import type {CDPSession} from 'playwright-core';
import {BREAKPOINTS_KEY, LIT_ID_OF_KEY} from '../../types/inspector.js';
import {type Fixture, startFixture} from './utils.js';

let fixture: Fixture;
let cdp: CDPSession;
let counterId: number;
/** The function each pause stopped in, newest last. */
const paused: string[] = [];

beforeAll(async () => {
  fixture = await startFixture({plugin: {timeline: true}});
  // The id the panel would hold, from the runtime's own lookup.
  counterId = (await fixture.page.evaluate(
    `globalThis[Symbol.for(${JSON.stringify(LIT_ID_OF_KEY.description)})](document.querySelector('hmr-counter'))`
  )) as number;
  expect(counterId).toBeTypeOf('number');

  cdp = await fixture.page.context().newCDPSession(fixture.page);
  cdp.on('Debugger.paused', (event) => {
    paused.push(event.callFrames[0]?.functionName ?? '');
    void cdp.send('Debugger.resume');
  });
  await cdp.send('Debugger.enable');
});

afterAll(async () => {
  await cdp?.detach().catch(() => {});
  await fixture?.close();
});

/** Calls the runtime's breakpoints as the extension does: from source text. */
const call = (expression: string): Promise<unknown> =>
  fixture.page.evaluate(
    `globalThis[Symbol.for(${JSON.stringify(BREAKPOINTS_KEY.description)})].${expression}`
  );

const increment = async (): Promise<void> => {
  await fixture.page.locator('hmr-counter #increment').click();
  // One frame for the update the click scheduled.
  await fixture.page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve))
  );
};

test('a property breakpoint pauses when it changes, and only then', async () => {
  expect(
    await call(`set(${counterId}, {kind: 'prop', name: 'count'}, true)`)
  ).toBe(true);
  const before = paused.length;
  await increment();
  await expect.poll(() => paused.length).toBe(before + 1);
  expect(paused.at(-1)).toBe('pauseOnChange');
  // The page carried on after the resume.
  await expect
    .poll(() => fixture.page.locator('hmr-counter #increment').textContent())
    .toContain('Count: 1');
  await call('clear()');
});

test('a render breakpoint pauses in render, and clearing stops it', async () => {
  expect(
    await call(`set(${counterId}, {kind: 'method', name: 'render'}, true)`)
  ).toBe(true);
  const before = paused.length;
  await increment();
  await expect.poll(() => paused.length).toBe(before + 1);
  expect(paused.at(-1)).toBe('pauseInMethod');

  await call('clear()');
  await increment();
  await fixture.page.waitForTimeout(100);
  expect(paused.length).toBe(before + 1);
});

test('an unknown property is refused', async () => {
  expect(
    await call(`set(${counterId}, {kind: 'prop', name: 'nope'}, true)`)
  ).toBe(false);
});
