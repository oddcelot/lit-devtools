/**
 * Makes the refresh token the release workflow's `youtube` job uploads with.
 * Run it once, signed in to Google as the channel owner:
 *
 *     YOUTUBE_CLIENT_ID=… YOUTUBE_CLIENT_SECRET=… node scripts/youtube-auth.mjs
 *
 * The client is an OAuth client of type "Desktop app" in the Google Cloud
 * project that has the YouTube Data API v3 enabled. The script listens on a
 * loopback port, prints the consent URL, and once you allow access it trades
 * the code for tokens and prints the refresh token, to store as the
 * YOUTUBE_REFRESH_TOKEN secret of the `youtube` environment. Nothing is
 * written to disk.
 *
 * Publish the OAuth consent screen ("In production") before running it: a
 * project left in "Testing" expires its refresh tokens after 7 days, and the
 * job would start failing a week later. Google then shows an "unverified
 * app" warning on the consent screen, which is expected for your own client.
 *
 * Follows https://developers.google.com/identity/protocols/oauth2/native-app
 * (loopback redirect with PKCE).
 */

import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'node:http';

const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const {YOUTUBE_CLIENT_ID: clientId, YOUTUBE_CLIENT_SECRET: clientSecret} =
  process.env;
if (!clientId || !clientSecret) {
  console.error(
    'Usage: YOUTUBE_CLIENT_ID=… YOUTUBE_CLIENT_SECRET=… node scripts/youtube-auth.mjs'
  );
  process.exit(1);
}

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const redirectUri = `http://127.0.0.1:${server.address().port}`;

const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
consent.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: SCOPE,
  // `offline` + `consent` make Google return a refresh token every time.
  access_type: 'offline',
  prompt: 'consent',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state,
}).toString();
console.log(`Open this URL and allow access:\n\n${consent}\n`);

const code = await new Promise((resolve, reject) => {
  server.on('request', (req, res) => {
    const params = new URL(req.url, redirectUri).searchParams;
    if (!params.has('code') && !params.has('error')) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'})
      .end('Done. You can close this tab and return to the terminal.');
    server.close();
    if (params.get('state') !== state) reject(new Error('State mismatch.'));
    else if (params.has('error')) reject(new Error(params.get('error')));
    else resolve(params.get('code'));
  });
});

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  }),
});
const json = await res.json();
if (!res.ok || !json.refresh_token) {
  console.error(
    `Token exchange failed: ${json.error ?? 'no refresh token'} ${json.error_description ?? ''}`
  );
  process.exit(1);
}
console.log(
  `Refresh token (store it as YOUTUBE_REFRESH_TOKEN in the youtube environment):\n\n${json.refresh_token}`
);
