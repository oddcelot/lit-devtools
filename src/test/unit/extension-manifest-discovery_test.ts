import {describe, expect, test, vi} from 'vite-plus/test';
import {
  findManifest,
  looksLikeManifest,
  manifestCandidates,
} from '../../../extension/src/manifest-discovery.js';

const SITE = 'https://webawesome.com';
const onSite = (url: string) => new URL(url).origin === SITE;

describe('manifestCandidates', () => {
  test("walks up from each script's folder to the root, first place kept", () => {
    expect(
      manifestCandidates(
        [
          `${SITE}/dist/webawesome.ssr-loader.js`,
          `${SITE}/dist/chunks/chunk.abc.js?v=1`,
          'https://cdn.example/lib.js',
          'not a url',
        ],
        onSite
      )
    ).toEqual([
      `${SITE}/dist/custom-elements.json`,
      `${SITE}/custom-elements.json`,
      `${SITE}/dist/chunks/custom-elements.json`,
    ]);
  });

  test('stops at the cap', () => {
    const deep = `${SITE}/a/b/c/d/e/f/g/h/i/j.js`;
    expect(manifestCandidates([deep], onSite, 3)).toEqual([
      `${SITE}/a/b/c/d/e/f/g/h/i/custom-elements.json`,
      `${SITE}/a/b/c/d/e/f/g/h/custom-elements.json`,
      `${SITE}/a/b/c/d/e/f/g/custom-elements.json`,
    ]);
  });
});

test('looksLikeManifest tells a manifest from an HTML 404 page', () => {
  expect(looksLikeManifest('{\n  "schemaVersion": "1.0.0",')).toBe(true);
  expect(looksLikeManifest('{"modules": []}')).toBe(true);
  expect(looksLikeManifest('<!doctype html><title>404</title>')).toBe(false);
  expect(looksLikeManifest('{"name": "pkg"}')).toBe(false);
});

describe('findManifest', () => {
  const served = (bodies: Record<string, [number, string]>) =>
    vi.fn(async (url: string) => {
      const [status, body] = bodies[url] ?? [404, '<!doctype html>'];
      return new Response(body, {status});
    });

  test('probes one at a time and stops at the first manifest', async () => {
    const fetchUrl = served({
      [`${SITE}/b.json`]: [200, '<!doctype html><p>soft 404</p>'],
      [`${SITE}/c.json`]: [200, '{"schemaVersion":"1.0.0","modules":[]}'],
      [`${SITE}/d.json`]: [200, '{"schemaVersion":"1.0.0","modules":[]}'],
    });
    const urls = ['a', 'b', 'c', 'd'].map((n) => `${SITE}/${n}.json`);
    expect(await findManifest(urls, fetchUrl)).toBe(`${SITE}/c.json`);
    expect(fetchUrl.mock.calls.map(([u]) => u)).toEqual(urls.slice(0, 3));
  });

  test('reads only the start of a large response', async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        const chunk =
          pulled === 1 ? '{"schemaVersion":"1.0.0",' : ' '.repeat(1024);
        controller.enqueue(new TextEncoder().encode(chunk));
      },
    });
    const url = `${SITE}/big.json`;
    expect(await findManifest([url], async () => new Response(body))).toBe(url);
    // Stopped well short of reading on forever.
    expect(pulled).toBeLessThan(10);
  });

  test('finds nothing when every probe fails', async () => {
    const fetchUrl = vi.fn(async () => {
      throw new TypeError('network');
    });
    expect(await findManifest([`${SITE}/x.json`], fetchUrl)).toBeUndefined();
  });
});
