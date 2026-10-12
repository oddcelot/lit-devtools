/**
 * Uploads a release's video to YouTube:
 *
 *     YOUTUBE_CLIENT_ID=… YOUTUBE_CLIENT_SECRET=… YOUTUBE_REFRESH_TOKEN=… \
 *       node scripts/youtube-publish.mjs v0.17.0
 *     node scripts/youtube-publish.mjs v0.17.0 --dry-run   # metadata only
 *     … node scripts/youtube-publish.mjs --check            # credentials only
 *
 * Used by the release workflow's `youtube` job. The video is the committed
 * render of the release's HyperFrames project,
 * `assets/release-<version>/renders/video.mp4`; a release without one has
 * nothing to upload, and the script says so and exits 0. The title is
 * `vite-plugin-lit <version>`, and the description is that version's
 * CHANGELOG.md section as plain text (scripts/release-notes.mjs), with the
 * links to the full notes. On success it prints the video id, and, under
 * GitHub Actions, writes it to the step's outputs as `video_id`.
 *
 * YouTube needs a user's OAuth grant to upload to a channel (a service
 * account can't own one), so the job carries a refresh token for the
 * channel owner, made once with scripts/youtube-auth.mjs. Each run trades it
 * for a short-lived access token with scope `youtube.upload`.
 *
 * Follows https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol:
 * a POST with the metadata opens an upload session, whose URL comes back in
 * `Location`, and one PUT sends the file. Videos uploaded through the API
 * from a Google Cloud project that hasn't passed YouTube's API compliance
 * audit are locked private whatever `privacyStatus` asks for; see
 * https://developers.google.com/youtube/v3/docs/videos/insert.
 *
 * `--check` only trades the refresh token and reads the access token's
 * scopes, which proves the client and the grant without uploading anything.
 */

import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';

const REPO = 'https://github.com/oddcelot/vite-plugin-lit';
const DOCS = 'https://oddcelot.github.io/vite-plugin-lit';
const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
// YouTube's limits: a 100-character title, a 5000-byte description, and
// neither may contain `<` or `>`.
const DESCRIPTION_MAX = 4900;

const args = process.argv.slice(2);
const check = args.includes('--check');
const dryRun = args.includes('--dry-run');
const tag = args.find((arg) => !arg.startsWith('--'));
const version = tag?.replace(/^v/, '');
const {
  YOUTUBE_CLIENT_ID: clientId,
  YOUTUBE_CLIENT_SECRET: clientSecret,
  YOUTUBE_REFRESH_TOKEN: refreshToken,
  YOUTUBE_PRIVACY: privacy = 'public',
} = process.env;

if (!check && !version) {
  console.error(
    'Usage: node scripts/youtube-publish.mjs <tag> [--dry-run] | --check'
  );
  process.exit(1);
}

/** Trades the refresh token for an access token. */
const accessToken = async () => {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN (see scripts/youtube-auth.mjs).'
    );
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    // `invalid_grant` is a revoked or expired refresh token: an OAuth app
    // left in "Testing" expires its tokens after 7 days.
    throw new Error(
      `Token refresh failed: ${json.error} ${json.error_description ?? ''}`.trim()
    );
  }
  return json.access_token;
};

if (check) {
  const token = await accessToken();
  const info = await (
    await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    )
  ).json();
  if (!info.scope?.split(' ').includes(UPLOAD_SCOPE)) {
    console.error(
      `[youtube] the grant lacks ${UPLOAD_SCOPE} (has: ${info.scope ?? 'none'})`
    );
    process.exit(1);
  }
  console.log('[youtube] credentials work and can upload');
  process.exit(0);
}

const video = `assets/release-${version}/renders/video.mp4`;
if (!existsSync(video)) {
  console.log(`[youtube] no ${video}; nothing to upload for ${tag}`);
  process.exit(0);
}

/** The changelog section as YouTube plain text. */
const describe = () => {
  const notes = execFileSync(
    process.execPath,
    ['scripts/release-notes.mjs', version],
    {encoding: 'utf8'}
  );
  const text = notes
    // The video's own poster link would point back at itself.
    .replace(/^\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\n*/gm, '')
    .replace(/^### (.+)$/gm, (_, heading) => heading.toUpperCase())
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/[<>]/g, '')
    // Unwrap the 79-column paragraphs and bullets; keep blank lines.
    .replace(/([^\n])\n(?!\n|- |[A-Z]+\n)\s*/g, '$1 ')
    .trim();
  const links = [
    `Release notes: ${REPO}/releases/tag/v${version}`,
    `Changelog: ${DOCS}/reference/changelog/`,
    `Docs: ${DOCS}/`,
  ].join('\n');
  const room = DESCRIPTION_MAX - links.length - 2;
  const body =
    text.length > room ? `${text.slice(0, room - 1).trimEnd()}…` : text;
  return `${body}\n\n${links}`;
};

const metadata = {
  snippet: {
    title: `vite-plugin-lit ${version}`,
    description: describe(),
    tags: ['vite-plugin-lit', 'Lit', 'Vite', 'web components', 'DevTools'],
    // Science & Technology.
    categoryId: '28',
    defaultLanguage: 'en',
  },
  status: {privacyStatus: privacy, selfDeclaredMadeForKids: false},
};

if (dryRun) {
  console.log(JSON.stringify(metadata, null, 2));
  process.exit(0);
}

const token = await accessToken();
const file = await readFile(video);

const session = await fetch(
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(file.length),
    },
    body: JSON.stringify(metadata),
  }
);
const location = session.headers.get('location');
if (!session.ok || !location) {
  console.error(
    `[youtube] opening the upload failed (${session.status}): ${await session.text()}`
  );
  process.exit(1);
}

const upload = await fetch(location, {
  method: 'PUT',
  headers: {'Content-Type': 'video/mp4'},
  body: file,
});
const result = await upload.json();
if (!upload.ok) {
  console.error(
    `[youtube] upload failed (${upload.status}): ${JSON.stringify(result.error ?? result)}`
  );
  process.exit(1);
}

console.log(
  `[youtube] uploaded https://youtu.be/${result.id} (${result.status?.privacyStatus})`
);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `video_id=${result.id}\n`);
}
