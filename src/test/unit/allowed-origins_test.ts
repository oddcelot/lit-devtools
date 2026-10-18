import {describe, expect, test} from 'vite-plus/test';
import {
  resolveAllowedOrigins,
  webContainerOrigins,
} from '../../lib/devframe/allowed-origins.js';
import type {WsOriginRegistry} from 'devframe/rpc/transports/ws-server';

const registry = (entries: string[]) =>
  resolveAllowedOrigins(entries) as WsOriginRegistry;

describe('resolveAllowedOrigins', () => {
  test('no entries leaves devframe on its default', () => {
    expect(resolveAllowedOrigins([])).toBeUndefined();
  });

  test('exact entries stay a plain list, without a trailing slash', () => {
    expect(
      resolveAllowedOrigins(['https://app.test:8443/', 'https://b.test'])
    ).toEqual(['https://app.test:8443', 'https://b.test']);
  });

  test('a wildcard admits every port of a StackBlitz project', () => {
    const list = registry(['https://*.webcontainer-api.io']);
    expect(
      list.isAllowed(
        'https://vitepluginlit-abc1--5181--9a3b2c1d.local-credentialless.webcontainer-api.io'
      )
    ).toBe(true);
    expect(list.isAllowed('https://x.webcontainer-api.io')).toBe(true);
  });

  test('a wildcard does not stretch past its literal suffix', () => {
    const list = registry(['https://*.webcontainer-api.io']);
    expect(list.isAllowed('https://webcontainer-api.io')).toBe(false);
    expect(list.isAllowed('https://x.webcontainer-api.io.evil.test')).toBe(
      false
    );
    expect(list.isAllowed('https://xwebcontainer-api.io')).toBe(false);
    expect(list.isAllowed('https://evil.test/.webcontainer-api.io')).toBe(
      false
    );
  });

  test('scheme and port have to match', () => {
    const list = registry(['https://*.example.test:8443']);
    expect(list.isAllowed('https://a.example.test:8443')).toBe(true);
    expect(list.isAllowed('http://a.example.test:8443')).toBe(false);
    expect(list.isAllowed('https://a.example.test')).toBe(false);
    expect(list.isAllowed('https://a.example.test:9443')).toBe(false);
  });

  test('loopback, no Origin and exact entries still pass alongside a wildcard', () => {
    const list = registry(['https://*.example.test', 'https://exact.other']);
    expect(list.isAllowed('http://localhost:3000')).toBe(true);
    expect(list.isAllowed('http://127.0.0.1:8080')).toBe(true);
    expect(list.isAllowed(undefined)).toBe(true);
    expect(list.isAllowed('https://exact.other')).toBe(true);
    expect(list.isAllowed('https://nope.other')).toBe(false);
  });

  test('the registry never registers a viewer', () => {
    const list = registry(['https://*.example.test']);
    expect(
      list.registerFromUrl(
        `/?devframe_viewer_origin=https://evil.test&devframe_viewer_origin_token=${list.token}`
      )
    ).toBeUndefined();
    expect(list.isAllowed('https://evil.test')).toBe(false);
  });

  test.each([
    'https://*',
    'https://*.com',
    'https://*.*.com',
    '*.example.test',
    'https://*.example.test/path',
  ])('refuses the over-broad or malformed %s', (entry) => {
    expect(() => resolveAllowedOrigins([entry])).toThrow(/--allow-origin/);
  });
});

describe('webContainerOrigins', () => {
  test('admits nothing extra outside a WebContainer', () => {
    expect(webContainerOrigins({node: '24.0.0'})).toBeUndefined();
  });

  test("admits a WebContainer port's origin, and loopback still", () => {
    const {isAllowed} = webContainerOrigins({
      node: '24.0.0',
      webcontainer: '1',
    }) as WsOriginRegistry;
    expect(
      isAllowed(
        'https://abc--4321--1a2b.local-credentialless.webcontainer-api.io'
      )
    ).toBe(true);
    expect(isAllowed('http://localhost:4321')).toBe(true);
    expect(isAllowed(undefined)).toBe(true);
    expect(isAllowed('https://evil.example.com')).toBe(false);
    expect(isAllowed('https://webcontainer-api.io.evil.com')).toBe(false);
  });
});
