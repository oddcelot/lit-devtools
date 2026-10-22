import {describe, expect, test} from 'vite-plus/test';
import {
  releasedVersions,
  upcomingVersions,
} from '../../../docs/src/lib/latest-release.mjs';

const changelog = `# Changelog

## 0.21.0 — 2026-10-19

Text.

## 0.20.0 — 2026-10-01
`;

/**
 * The docs' <Since> badge accepts a version with a CHANGELOG.md section, or
 * one the next release can be, for a feature merged before it ships.
 */
describe('upcomingVersions', () => {
  test('is a patch, minor or major step from the newest release', () => {
    expect(releasedVersions(changelog)).toEqual(['0.21.0', '0.20.0']);
    expect(upcomingVersions(changelog)).toEqual(['0.21.1', '0.22.0', '1.0.0']);
  });

  test('leaves out a skipped version, which is a typo', () => {
    expect(upcomingVersions(changelog)).not.toContain('0.23.0');
  });

  test('is empty without any release', () => {
    expect(upcomingVersions('# Changelog\n')).toEqual([]);
  });
});
