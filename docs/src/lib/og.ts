/**
 * Which Open Graph image a page gets. The image endpoint
 * (`src/pages/og/[...slug].ts`) generates the cards and the route middleware
 * (`src/routeData.ts`) points each page's `og:image` at one; both go through
 * here so the two can never disagree about the URL.
 *
 * Pages of the `docs` collection get a card each. The changelog's pages come
 * from starlight-changelogs instead: a release with a video uses the video's
 * poster, any other release gets a card of its own, and the version list and
 * compare views share one card for the whole changelog.
 */
import {existsSync} from 'node:fs';

/** Rendered size of every card; the middleware publishes it as og:image:width/height. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Size the release video posters in `public/demo/` are saved at. */
const POSTER_WIDTH = 1280;
const POSTER_HEIGHT = 720;

/** The `base` starlight-changelogs serves the changelog under. */
export const CHANGELOG_BASE = 'reference/changelog';
const VERSION_PREFIX = `${CHANGELOG_BASE}/version/`;

/** A page's Open Graph image: a path under the site's base, its size and its alt text. */
export interface OgImage {
  path: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * Image path for a `docs` collection entry id, relative to `og/`. The
 * collection calls the home page `index`, but Starlight's route data hands the
 * middleware `''` for it, so both spellings land on the same file.
 */
export function ogImageSlug(entryId: string): string {
  return `${entryId || 'index'}.png`;
}

/**
 * The version a changelog release page shows, from its route id
 * (`reference/changelog/version/0-20-0` is `0.20.0`); nothing for any other
 * route, a compare view (`…/0-19-0...latest`) included.
 */
export function changelogVersion(routeId: string): string | undefined {
  if (!routeId.startsWith(VERSION_PREFIX)) return undefined;
  const slug = routeId.slice(VERSION_PREFIX.length);
  return /^\d+(?:-\d+)*$/.test(slug) ? slug.replaceAll('-', '.') : undefined;
}

/** The release video's poster for a version, if that release has one. */
export function releasePoster(version: string): string | undefined {
  const path = `demo/release-${version}-poster.jpg`;
  return existsSync(`./public/${path}`) ? path : undefined;
}

/** The image for a Starlight route, by the id its route data carries. */
export function ogImageFor(routeId: string, title: string): OgImage {
  const version = changelogVersion(routeId);
  if (version !== undefined) {
    const poster = releasePoster(version);
    const alt = `vite-plugin-lit ${version}`;
    return poster
      ? {
          path: poster,
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          alt: `${alt} release video`,
        }
      : {path: `og/${routeId}.png`, width: OG_WIDTH, height: OG_HEIGHT, alt};
  }
  if (routeId === CHANGELOG_BASE || routeId.startsWith(`${CHANGELOG_BASE}/`)) {
    return {
      path: `og/${CHANGELOG_BASE}.png`,
      width: OG_WIDTH,
      height: OG_HEIGHT,
      alt: 'vite-plugin-lit changelog',
    };
  }
  return {
    path: `og/${ogImageSlug(routeId)}`,
    width: OG_WIDTH,
    height: OG_HEIGHT,
    alt: title,
  };
}
