import {defineConfig} from 'oxlint';
import litDevtools from '@oddsquad/lit-devtools/oxlint';

// `npm run lint` reports the same problems as the editor, one rule each. The
// recommended config turns every rule on at the editor's default severity;
// the two below are off there, as they are in the editor, and on here.
export default defineConfig({
  extends: [litDevtools.configs.recommended],
  rules: {
    'lit-devtools/missing-import': 'warn',
    'lit-devtools/property-visibility': 'warn',
  },
});
