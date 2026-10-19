import {describe, expect, test} from 'vite-plus/test';
import {
  normalizeFolder,
  readProjectRoot,
  writeProjectRoot,
} from '../../../extension/src/project-root.js';

const memory = () => {
  const items: Record<string, unknown> = {};
  return {
    get: (key: string) => Promise.resolve({[key]: items[key]}),
    set: (next: Record<string, unknown>) =>
      Promise.resolve(void Object.assign(items, next)),
  };
};

describe('project root', () => {
  test('keeps a folder per site, and forgets it', async () => {
    const storage = memory();
    await writeProjectRoot(storage, 'http://a.test', '/home/me/a');
    await writeProjectRoot(storage, 'http://b.test', '/home/me/b');
    expect(await readProjectRoot(storage, 'http://a.test')).toBe('/home/me/a');
    await writeProjectRoot(storage, 'http://a.test', undefined);
    expect(await readProjectRoot(storage, 'http://a.test')).toBeUndefined();
    expect(await readProjectRoot(storage, 'http://b.test')).toBe('/home/me/b');
  });

  test('remembers not to ask for a site', async () => {
    const storage = memory();
    await writeProjectRoot(storage, 'http://a.test', false);
    expect(await readProjectRoot(storage, 'http://a.test')).toBe(false);
  });

  test('a typed folder reads as the server names paths', () => {
    expect(normalizeFolder('  /home/me/app/ ')).toBe('/home/me/app');
    expect(normalizeFolder('C:\\app\\')).toBe('C:/app');
  });
});
