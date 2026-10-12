import {expect, test} from 'vite-plus/test';
import {isOverridesRequest} from '../../../extension/src/protocol.js';
import {
  handleOverridesRequest,
  savedOverridesKey,
} from '../../../extension/src/saved-overrides.js';

// `chrome.storage.session` as far as the handler uses it.
const fakeArea = () => {
  const store: Record<string, unknown> = {};
  return {
    store,
    async get(key: string) {
      return key in store ? {[key]: store[key]} : {};
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
  };
};

test('keeps each origin to its own item', async () => {
  const area = fakeArea();
  const a = 'https://a.example';
  const json = '{"/":[]}';
  expect(
    await handleOverridesRequest(area, a, {type: 'lit:overrides-set', json})
  ).toBeNull();
  expect(area.store).toEqual({[savedOverridesKey(a)]: json});
  expect(
    await handleOverridesRequest(area, a, {type: 'lit:overrides-get'})
  ).toBe(json);
  expect(
    await handleOverridesRequest(area, 'https://b.example', {
      type: 'lit:overrides-get',
    })
  ).toBeNull();
});

test('only well-formed override requests pass the guard', () => {
  expect(isOverridesRequest({type: 'lit:overrides-get'})).toBe(true);
  expect(isOverridesRequest({type: 'lit:overrides-set', json: '{}'})).toBe(
    true
  );
  expect(isOverridesRequest({type: 'lit:overrides-set', json: {}})).toBe(false);
  expect(isOverridesRequest({type: 'lit:enable', origin: 'x'})).toBe(false);
  expect(isOverridesRequest(null)).toBe(false);
});
