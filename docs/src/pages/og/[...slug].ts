/**
 * One Open Graph card per docs page, rendered at build time: satori lays the
 * card out as SVG, sharp rasterises it to PNG. The changelog gets one card for
 * its version list and one per release without a video poster; which page
 * shows which image is `src/lib/og.ts`'s call. Each card carries the Lit flame
 * and the site name, the page's section, its title and its description, on a
 * deep Lit-blue gradient with a cyan rule along the bottom edge.
 *
 * The text is set in the site's own Manrope, read through Astro's font data
 * (the `--font-manrope-og` entry in astro.config.mjs, which exists because
 * satori reads neither the site's woff2 files nor variable fonts).
 */
import {readFile} from 'node:fs/promises';
import type {APIRoute, GetStaticPaths} from 'astro';
import {experimental_getFontFileURL, fontData} from 'astro:assets';
import {getCollection, type CollectionEntry} from 'astro:content';
import satori from 'satori';
import sharp from 'sharp';
import {
  CHANGELOG_BASE,
  OG_HEIGHT,
  OG_WIDTH,
  changelogVersion,
  ogImageSlug,
  releasePoster,
} from '../../lib/og';

type Entry = CollectionEntry<'docs'>;

/** What a card says: the eyebrow, the headline and the line under it. */
interface Card {
  section?: string;
  title: string;
  description?: string;
}

export const getStaticPaths = (async () => {
  const docs = (await getCollection('docs')).map((entry) => ({
    params: {slug: ogImageSlug(entry.id)},
    props: {card: docsCard(entry)},
  }));
  const changelog = {
    params: {slug: `${CHANGELOG_BASE}.png`},
    props: {
      card: {
        section: 'Changelog',
        title: 'What changed, release by release',
        description:
          'Every vite-plugin-lit release since 0.3.0, newest first, with the fixes and features in each.',
      },
    },
  };
  // Releases with a video use its poster instead (src/lib/og.ts).
  const releases = (await getCollection('changelogs')).flatMap((entry) => {
    const version = changelogVersion(entry.id);
    if (version === undefined || releasePoster(version)) return [];
    return [
      {
        params: {slug: `${entry.id}.png`},
        props: {
          card: {
            section: 'Changelog',
            title: `Release ${version}`,
            description: releaseIntro(entry.body ?? ''),
          },
        },
      },
    ];
  });
  // The landing page is not a docs entry (src/pages/index.astro).
  const home = {
    params: {slug: 'index.png'},
    props: {
      card: {
        title: 'Edit a Lit component. Keep the page.',
        description:
          'True HMR for Lit in Vite, one shared stylesheet for every shadow root, and a DevTools panel that explains each re-render.',
      },
    },
  };
  return [home, ...docs, changelog, ...releases];
}) satisfies GetStaticPaths;

/** Longest card description, in characters: three lines at the card's 32px. */
const DESCRIPTION_MAX = 170;

/**
 * A release section's intro for its card: the first sentence of its first
 * paragraph, as plain text, cut at a word if it would run past three lines.
 */
function releaseIntro(body: string): string | undefined {
  const intro = body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#|\[!\[|[-*] )/.test(block))
    ?.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ');
  const sentence = intro?.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? intro;
  if (sentence === undefined || sentence.length <= DESCRIPTION_MAX) {
    return sentence;
  }
  const cut = sentence.slice(0, DESCRIPTION_MAX);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}

/** Sidebar group labels, by the top-level directory an entry lives in. */
const SECTIONS: Record<string, string> = {
  start: 'Start here',
  guides: 'Guides',
  concepts: 'Concepts',
  reference: 'Reference',
  contributing: 'Contributing',
};

const flame = `data:image/svg+xml;base64,${(
  await readFile('./src/assets/lit-flame.svg')
).toString('base64')}`;

let fonts: Promise<Parameters<typeof satori>[1]['fonts']> | undefined;

/** The two static Manrope weights, fetched once per build. */
function loadFonts(base: URL) {
  fonts ??= Promise.all(
    ([500, 800] as const).map(async (weight) => {
      const url = fontData['--font-manrope-og']?.find(
        (face) => face.weight === String(weight)
      )?.src[0]?.url;
      if (url === undefined) {
        throw new Error(
          `No Manrope ${weight} in the --font-manrope-og font data.`
        );
      }
      const data = await fetch(experimental_getFontFileURL(url, base)).then(
        (res) => res.arrayBuffer()
      );
      return {name: 'Manrope', data, weight, style: 'normal' as const};
    })
  );
  return fonts;
}

/**
 * A satori element; satori takes React-shaped nodes, no JSX needed. Nulls are
 * dropped and a lone child is passed bare, because satori counts every array
 * slot as a child and demands `display: flex` once there are two.
 */
function h(
  type: string,
  style: Record<string, string | number>,
  ...children: unknown[]
) {
  const kept = children.filter((child) => child != null);
  return {type, props: {style, children: kept.length === 1 ? kept[0] : kept}};
}

function docsCard(entry: Entry): Card {
  return {
    section: SECTIONS[entry.id.split('/')[0]],
    title: headline(entry),
    description: entry.data.description,
  };
}

/** The home page's title is the site name, so its card leads with the tagline's opening instead. */
function headline(entry: Entry): string {
  const tagline = entry.data.hero?.tagline;
  if (entry.id !== 'index' || typeof tagline !== 'string')
    return entry.data.title;
  return tagline
    .split(/(?<=\.)\s+/)
    .slice(0, 2)
    .join(' ');
}

export const GET: APIRoute<{card: Card}> = async ({
  props: {
    card: {section, title, description},
  },
  url,
}) => {
  const card = h(
    'div',
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '64px 72px 72px',
      backgroundImage: 'linear-gradient(135deg, #161c5c 0%, #080a22 100%)',
      borderBottom: '10px solid #00e8ff',
      fontFamily: 'Manrope',
      color: '#ffffff',
    },
    h(
      'div',
      {display: 'flex', alignItems: 'center', gap: 20},
      {type: 'img', props: {src: flame, width: 52, height: 64}},
      h('div', {fontSize: 34, fontWeight: 800}, 'vite-plugin-lit')
    ),
    h(
      'div',
      {display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1020},
      section
        ? h(
            'div',
            {
              fontSize: 24,
              fontWeight: 800,
              color: '#00e8ff',
              textTransform: 'uppercase',
              letterSpacing: 2,
            },
            section
          )
        : null,
      h('div', {fontSize: 68, fontWeight: 800, lineHeight: 1.12}, title),
      description
        ? h(
            'div',
            {
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.4,
              color: '#c4ccff',
              lineClamp: 3,
            },
            description
          )
        : null
    )
  );

  const svg = await satori(card as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await loadFonts(url),
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: {'Content-Type': 'image/png'},
  });
};
