import {defineConfig, fontProviders} from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import {litDevtools} from '@oddsquad/vite-plugin-lit/astro';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';
import starlightChangelogs, {
  makeChangelogsSidebarLinks,
} from 'starlight-changelogs';
// The redirect map for moved pages lives next to this file.
import {redirects} from './redirects.mjs';
import {cpSync, existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {latestRelease} from './src/lib/latest-release.mjs';
import {liveDemoDevLit} from './src/lib/live-demo-dev-lit.mjs';
import {liveDemoPrivateFields} from './src/lib/live-demo-private-fields.mjs';
import {liveDemoNoPageRuntime} from './src/lib/live-demo-no-page-runtime.mjs';
import {liveExamplesOwnBuild} from './src/lib/live-examples-own-build.mjs';
import {ownConfigExamples} from './src/lib/live-examples.ts';

const latest = latestRelease(
  readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
);

/**
 * The public/ files of each example published as a live demo
 * (src/lib/live-examples.ts), served at its demo page's URL,
 * /live-panel/examples/<name>/demo/, where the page's rewritten
 * root-relative URLs look for them (src/lib/live-example-page.ts). The
 * build copies them next to each demo page it wrote; the dev server hands
 * those requests to Vite's file serving.
 */
const EXAMPLES = new URL('../examples/', import.meta.url);
const EXAMPLE_PUBLIC_URL = /^\/live-panel\/examples\/([\w-]+)\/demo\/([^?#]+)/;
const liveExamplesPublic = () => ({
  name: 'live-examples-public',
  hooks: {
    'astro:server:setup': ({server}) => {
      server.middlewares.use((req, _res, next) => {
        const [, name, file] = req.url?.match(EXAMPLE_PUBLIC_URL) ?? [];
        if (name !== undefined && !decodeURIComponent(file).includes('..')) {
          const path = new URL(`${name}/public/${file}`, EXAMPLES);
          if (existsSync(path) && statSync(path).isFile()) {
            req.url = `/@fs${fileURLToPath(path)}`;
          }
        }
        next();
      });
    },
    'astro:build:done': ({dir}) => {
      const built = new URL('live-panel/examples/', dir);
      if (!existsSync(built)) return;
      for (const name of readdirSync(built)) {
        const files = new URL(`${name}/public/`, EXAMPLES);
        if (existsSync(files)) {
          cpSync(files, new URL(`${name}/demo/`, built), {recursive: true});
        }
      }
    },
  },
});

export default defineConfig({
  site: 'https://vite-plugin-lit.oddsquad.dev',
  vite: {
    plugins: [liveDemoDevLit(), liveDemoPrivateFields()],
    build: {
      rolldownOptions: {
        output: {
          // Video.js in one chunk, so it runs in source order. Once it was
          // split across chunks shared with another importer, the skin
          // module ran before the player's: <video-skin> asked for the
          // player's state before any <video-player> was defined, and its
          // poster never showed. Vite's dynamic-import helper gets its own
          // chunk first, or the group would pull it in and any page with a
          // dynamic import would download Video.js for the helper alone.
          codeSplitting: {
            groups: [
              {name: 'preload-helper', test: /preload-helper/, priority: 2},
              {name: 'videojs', test: /[\\/]@videojs[\\/]/, priority: 1},
            ],
          },
        },
      },
    },
  },
  // Font files pulled from Fontsource at build time. Astro downloads, subsets
  // and fingerprints them into the build, and generates fallback metrics so
  // swapping in the real face does not shift the layout. Nothing is fetched
  // from a CDN at runtime. Body text uses the system sans stack and needs no
  // entry here.
  fonts: [
    // Manrope, for the Open Graph cards only (src/pages/og/). Satori renders
    // without system fonts, so a card needs a font file; it reads neither
    // woff2 nor variable fonts, so this entry asks for static TTF instances
    // of the two weights a card uses. No <Font> tag renders it,
    // so browsers never download these files.
    {
      name: 'Manrope',
      cssVariable: '--font-manrope-og',
      provider: fontProviders.fontsource(),
      weights: [500, 800],
      styles: ['normal'],
      subsets: ['latin'],
      formats: ['ttf'],
    },
    {
      name: 'Lilex',
      cssVariable: '--font-lilex',
      provider: fontProviders.fontsource(),
      // Variable too; code is mostly 400, with bold for emphasis.
      weights: ['400 700'],
      styles: ['normal'],
      subsets: ['latin'],
    },
  ],
  redirects,
  integrations: [
    // The plugin this site documents, run on the site itself: Lit DevTools
    // in Astro's dev toolbar while writing docs. Without the renderer
    // (`lit()`): no page server-renders a Lit component, and the renderer's
    // hydrate support would add ~15 KB to every page. The Web Awesome
    // components are client-only and bring their own Lit. Not in the live
    // panel's demo frames, which bring their own runtime: see
    // liveDemoNoPageRuntime, which has to come first.
    liveDemoNoPageRuntime(),
    litDevtools(),
    liveExamplesPublic(),
    liveExamplesOwnBuild(ownConfigExamples()),
    starlight({
      title: 'vite-plugin-lit',
      // The Lit flame from the design system, beside the title rather than
      // replacing it: this is a plugin for Lit, not Lit itself, and the
      // wordmark lockup would claim otherwise.
      logo: {
        src: './src/assets/lit-flame.svg',
        alt: '',
      },
      description:
        'True HMR for Lit components, CSS delivery helpers, and a DevTools timeline for Vite.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/oddcelot/vite-plugin-lit',
        },
        {
          icon: 'npm',
          label: 'npm',
          href: 'https://www.npmjs.com/package/@oddsquad/vite-plugin-lit',
        },
      ],
      // Attributes shared cards to the account on X, without adding an X
      // link to the header the way a `social` entry would.
      head: [
        {tag: 'meta', attrs: {name: 'twitter:site', content: '@oddcelot'}},
      ],
      editLink: {
        baseUrl: 'https://github.com/oddcelot/vite-plugin-lit/edit/main/docs/',
      },
      lastUpdated: true,
      // Adds each page's generated Open Graph image to its head.
      routeMiddleware: './src/routeData.ts',
      customCss: [
        // The Lit theme for Web Awesome, which brings the design tokens.
        '@oddsquad/webawesome-theme-lit/lit.css',
        './src/styles/custom.css',
      ],
      components: {
        // Adds the font tags; see the file for why this override exists.
        Head: './src/components/Head.astro',
      },
      // Starlight >= 0.39 requires the autogenerate config inside `items`;
      // a group with a bare `autogenerate` key is a hard error.
      // Nested groups are declared by hand: an autogenerated subdirectory
      // would be labelled with its raw dirname.
      sidebar: [
        {label: 'Overview', items: [{autogenerate: {directory: 'overview'}}]},
        {label: 'Start here', items: [{autogenerate: {directory: 'start'}}]},
        // Top level rather than under Reference, badged with the newest
        // version, so what shipped is one click from every page.
        ...makeChangelogsSidebarLinks([
          {type: 'all', base: 'reference/changelog', label: 'Changelog'},
        ]).map((link) => ({
          ...link,
          badge: {text: `v${latest.version}`, variant: 'tip'},
        })),
        {
          label: 'Guides',
          items: [
            'guides/hmr',
            {
              label: 'Stylesheets',
              items: [{autogenerate: {directory: 'guides/stylesheets'}}],
            },
            {
              label: 'DevTools',
              items: [{autogenerate: {directory: 'guides/devtools'}}],
            },
            'guides/ecosystem',
            'guides/manifest',
            'guides/astro',
            'guides/source-overlay',
            'guides/troubleshooting',
          ],
        },
        {label: 'Concepts', items: [{autogenerate: {directory: 'concepts'}}]},
        {
          label: 'Reference',
          items: [{autogenerate: {directory: 'reference'}}],
        },
        {
          label: 'Contributing',
          items: [{autogenerate: {directory: 'contributing'}}],
        },
      ],
      plugins: [
        starlightLinksValidator({
          // The changelog pages come from starlight-changelogs, outside the
          // docs collection the validator checks against.
          exclude: ['/reference/changelog/', '/reference/changelog/**/*'],
        }),
        starlightChangelogs(),
        // llms.txt and friends, for coding agents working in a project that
        // uses the plugin. The package name is what an agent has to install,
        // so it heads the file. Setup comes first and the contributor pages
        // last; llms-small drops what a user of the plugin never needs
        // (contributing, benchmarks, the tutorial's step-by-step and the
        // explanation pages). The changelog is not a docs page, so it is in
        // neither.
        starlightLlmsTxt({
          projectName: '@oddsquad/vite-plugin-lit',
          promote: ['start/installation*', 'reference/options*'],
          demote: ['contributing/**', 'reference/benchmarks*'],
          exclude: [
            'contributing/**',
            'concepts/**',
            'reference/benchmarks',
            'start/first-component',
          ],
          customSets: [
            {
              label: 'DevTools',
              description:
                'the DevTools panel, the timeline, and connecting a coding agent over MCP',
              paths: [
                'guides/devtools/**',
                'reference/cli',
                'concepts/devtools-architecture',
              ],
            },
            {
              label: 'Stylesheets',
              description:
                'delivering CSS to shadow roots: import queries, ?css-sheet and urlSheet()',
              paths: [
                'guides/stylesheets/**',
                'reference/import-queries',
                'concepts/css-delivery',
              ],
            },
          ],
        }),
      ],
    }),
    // The live panel's pages and the landing page's demos are only ever
    // framed by another page.
    sitemap({
      filter: (page) =>
        !page.includes('/live-panel/') && !page.includes('/demo/'),
    }),
  ],
});
