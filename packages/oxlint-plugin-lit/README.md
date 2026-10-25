# @oddsquad/oxlint-plugin-lit

Oxlint rules for Lit templates: the problems the
[Lit language server](https://www.npmjs.com/package/@oddsquad/lit-language-server)
shows in the editor, failing a lint run. A handler whose parameter doesn't fit
its event, or a broken `css` template, stops CI the way it shows in VS Code or
Zed.

## Use it

```sh
npm install -D oxlint @oddsquad/oxlint-plugin-lit
```

```ts
// oxlint.config.ts
import {defineConfig} from 'oxlint';
import litDevtools from '@oddsquad/oxlint-plugin-lit';

export default defineConfig({
  extends: [litDevtools.configs.recommended],
});
```

`recommended` turns every rule on at the severity the editor uses. Rules set
next to `extends` win, so `rules: {'lit-devtools/css': 'off'}` turns one off.
With Vite+, the same object goes under `lint` in `vite.config.ts`. In an
`.oxlintrc.json`, list the plugin and its rules:

```json
{
  "jsPlugins": ["@oddsquad/oxlint-plugin-lit"],
  "rules": {"lit-devtools/event-type": "error", "lit-devtools/css": "warn"}
}
```

It reads the same settings as the language server, from your Vite config or
a `lit-devtools.config.ts`, except `diagnostics`: Oxlint's config sets the
severities.
[Check it in CI with Oxlint](https://lit-devtools.oddsquad.dev/guides/language-server/#check-it-in-ci-with-oxlint)
has the details, and the
[reference](https://lit-devtools.oddsquad.dev/reference/language-server/#oxlint-plugin)
lists the rules.

## License

BSD-3-Clause
