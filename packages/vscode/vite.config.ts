import {defineConfig} from 'vite-plus';

export default defineConfig({
  pack: [
    {
      // VS Code loads the extension with require(), and provides `vscode`.
      entry: {extension: 'src/extension.ts'},
      format: ['cjs'],
      platform: 'node',
      outDir: 'dist',
      dts: false,
      deps: {neverBundle: ['vscode']},
    },
    {
      // The language server, bundled so the extension works in a project
      // that doesn't install it. The oxc packages load native bindings, so
      // scripts/stage-server.mjs copies them in for each platform; Vite is
      // loaded from the project, when it has one.
      entry: {bin: '../lit-language-server/src/bin.ts'},
      format: ['esm'],
      platform: 'node',
      outDir: 'dist/server',
      dts: false,
      deps: {neverBundle: ['vite', 'oxc-parser', 'oxc-resolver']},
      // vscode-css-languageservice's `main` is a UMD build whose dynamic
      // requires a bundle can't follow; its `module` build is plain ESM.
      inputOptions: {resolve: {mainFields: ['module', 'main']}},
    },
  ],
});
