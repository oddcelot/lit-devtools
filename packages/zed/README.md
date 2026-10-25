# Lit DevTools for Zed

Completion and hover for Lit components in `html` templates and HTML files,
from the [Lit language server](../lit-language-server).

## Try it from this repo

1. Build the server: `vp pack` in `packages/lit-language-server`.
2. In Zed, run **zed: install dev extension** and pick this folder. Zed
   compiles it; that needs Rust from rustup.
3. Open this repo as a project. The extension finds the server in
   `packages/lit-language-server`.

To use it in another project before the server is published, point Zed at
the built server in its settings:

```json
{
  "lsp": {
    "lit-language-server": {
      "binary": {
        "path": "/path/to/vite-plugin-lit/packages/lit-language-server/dist/bin.mjs"
      }
    }
  }
}
```

## How it finds the server

1. `lsp.lit-language-server.binary.path` in Zed's settings, with any
   `arguments`.
2. The project's `node_modules/@oddsquad/lit-language-server`, so the version
   matches the project.
3. `packages/lit-language-server` in this repo.
4. The latest `@oddsquad/lit-language-server` from npm, installed into the
   extension's folder (once it is published).

A `.js` or `.mjs` server runs with Zed's own Node.
