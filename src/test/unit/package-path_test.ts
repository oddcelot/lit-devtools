import {expect, test} from 'vite-plus/test';
import {packageOfPath} from '../../lib/package-path.js';

test('the innermost package of a path, with what pnpm says of its version', () => {
  expect(
    packageOfPath(
      '/@fs/app/node_modules/.pnpm/@x+ui@2.1.0_peer@1.0.0/node_modules/@x/ui/dist/a.js'
    )
  ).toEqual({name: '@x/ui', version: '2.1.0', inner: 'dist/a.js'});
  expect(packageOfPath('node_modules/a/node_modules/b/index.js')).toEqual({
    name: 'b',
    inner: 'index.js',
  });
});

test('a path in no package', () => {
  expect(packageOfPath('src/a.ts')).toBeUndefined();
  expect(packageOfPath('node_modules/.vite/deps/lit.js')).toBeUndefined();
  expect(packageOfPath('node_modules/@scope')).toBeUndefined();
});
