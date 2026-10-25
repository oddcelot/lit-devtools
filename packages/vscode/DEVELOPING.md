# Developing the VS Code extension

`README.md` is the Marketplace listing; this is how to build and try the
extension from the repo.

```sh
pnpm install
cd packages/vscode
pnpm run build            # bundles the extension and the server into dist/
pnpm run package          # lit-<platform>.vsix for this machine
pnpm run package all      # one .vsix per platform VS Code publishes for
```

The server's parser and resolver are native, so each package carries one
platform's bindings: `scripts/stage-server.mjs` copies them into
`dist/server/node_modules`, fetching them from npm when they aren't
installed here. Install a package with **Extensions: Install from VSIX…**,
or press F5 in a window open on this folder to run it in an Extension
Development Host.

Inside this repo the extension runs `packages/lit-language-server`'s build
rather than its bundled copy, so rebuild that package (`vp pack` there) and
run **Lit: Restart Language Server** after changing the server.
