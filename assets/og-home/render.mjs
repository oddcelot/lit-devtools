// Renders index.html beside this file to docs/public/og/index.png, the
// landing page's Open Graph card. Run from the repo root after editing the
// card: `node assets/og-home/render.mjs`.
import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';

const here = new URL('.', import.meta.url);
const out = new URL('../../docs/public/og/index.png', import.meta.url);
mkdirSync(new URL('.', out), {recursive: true});

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: {width: 1200, height: 630},
  deviceScaleFactor: 1,
});
await page.goto(new URL('index.html', here).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({path: out.pathname});
await browser.close();
