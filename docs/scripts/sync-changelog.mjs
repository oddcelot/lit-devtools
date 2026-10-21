// Prepares the root CHANGELOG.md for starlight-changelogs, which renders the
// version list and a page per release (src/content.config.ts). Its Keep a
// Changelog provider reads a release date only from a `## X.Y.Z - YYYY-MM-DD`
// heading, while our headings use an em dash, which scripts/release-notes.mjs
// and the release workflow match on. So this writes a copy with the dash
// swapped instead of changing the convention. The copy is gitignored; the
// root file stays the single source of truth.
//
// A release video sits in CHANGELOG.md as a poster linking to the MP4 on the
// GitHub release, because GitHub strips <video> from markdown. The docs can
// play it inline, but not from the release: Safari refuses the release
// asset's download URL. So when the poster is `public/demo/<name>-poster.jpg`
// and `public/demo/<name>.mp4` exists beside it, the copy gets the site's
// Video.js player (src/components/VideoPlayerScript.astro) on the docs' own
// file instead, under /demo/ whatever host and path the poster URL names, so
// an older entry's URL can't point the player at a path the site no longer
// serves. Each tag sits on its own line so markdown keeps the lines as
// one HTML block rather than wrapping them in a paragraph.
import {existsSync} from 'node:fs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../CHANGELOG.md');
const target = resolve(here, '../.generated/CHANGELOG.md');
const demo = resolve(here, '../public/demo');

const raw = await readFile(source, 'utf8');
const body = raw
  .replace(
    /^(## \S+) — (\d{4}-\d{2}-\d{2})$/gm,
    (_, version, date) => `${version} - ${date}`
  )
  .replace(
    /^\[!\[([^\]]*)\]\(https?:\/\/[^)]*\/demo\/([\w.-]+)-poster\.jpg\)\]\([^)]+\.mp4\)$/gm,
    (line, label, name) =>
      existsSync(resolve(demo, `${name}.mp4`))
        ? [
            '<video-player class="changelog-video">',
            '<video-skin>',
            `<video src="/demo/${name}.mp4" width="1920" height="1080" aria-label="${label}" playsinline preload="none"></video>`,
            `<img slot="poster" src="/demo/${name}-poster.jpg" alt="">`,
            '</video-skin>',
            '</video-player>',
          ].join('\n')
        : line
  );

await mkdir(dirname(target), {recursive: true});
await writeFile(target, body);
console.log(`[sync-changelog] wrote ${target}`);
