# Security policy

## Supported versions

The plugin is pre-1.0, so only the latest release gets fixes. Update to it
before reporting, in case the problem is already gone.

## Reporting a vulnerability

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/oddcelot/lit-devtools/security/advisories/new),
not in a public issue. Say what an attacker can do, which versions and
setups are affected, and how to reproduce it.

Most of the plugin runs only in the Vite dev server, so the likely surface
is what the dev server exposes: the DevTools panel and its endpoints, and
the requests that open source files in your editor.

You'll get a reply within a week. Once a fix is released, the advisory is
published with credit to you, unless you'd rather not be named.
