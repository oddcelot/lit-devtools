/**
 * The page the live panel inspects by default: three playground components
 * behind the page runtime (`demo-runtime.ts`). The docs' guides and the
 * kitchen sink frame it.
 */
import {startDemoPage} from './demo-runtime.js';

await startDemoPage(() =>
  Promise.all([
    import('../../../../playground/src/hmr-counter.js'),
    import('../../../../playground/src/hmr-properties.js'),
    import('../../../../playground/src/hmr-lifecycle.js'),
  ])
);
