# Lit for VS Code

Completion, hover and diagnostics for Lit components, from the
[Lit language server](https://github.com/oddcelot/vite-plugin-lit/tree/main/packages/lit-language-server).
In `html` and `svg` templates, HTML files and `css` templates, it completes
your components' tags, attributes, properties and events, shows their docs on
hover, types your event handlers, and reports a handler that doesn't fit its
event. It reads your components from source as you type, and your
dependencies' Custom Elements Manifests, in one package or a whole monorepo,
with or without Vite.

[Use the Lit language server](https://vite-plugin-lit.oddsquad.dev/guides/language-server/)
covers its settings; the
[reference](https://vite-plugin-lit.oddsquad.dev/reference/language-server/)
lists everything it completes, shows and reports.

## Which server runs

1. The `lit.server.path` setting, when set.
2. The project's own `node_modules/@oddsquad/lit-language-server`, so the
   version matches the project.
3. `packages/lit-language-server` in the vite-plugin-lit repo.
4. The copy bundled with the extension, so it works with nothing installed.

**Lit: Restart Language Server** picks again, for instance after installing
the package. The **Lit Language Server** output channel says which one
started.

## Build it from this repo

```sh
pnpm install
cd packages/vscode
pnpm run build            # bundles the extension and the server into dist/
pnpm run package          # lit-<platform>.vsix for this machine
pnpm run package all      # one .vsix per platform VS Code publishes for
```

The server's parser and resolver are native, so each package carries the
bindings for one platform. Install a package with **Extensions: Install from
VSIX…**, or press F5 in a window open on this folder to run it in an
Extension Development Host.

## License

BSD-3-Clause
