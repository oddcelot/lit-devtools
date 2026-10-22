export function latestRelease(changelog: string): {
  version: string;
  date: string;
  path: string;
};
export function releasedVersions(changelog: string): string[];
export function upcomingVersions(changelog: string): string[];
export function releasePath(version: string): string;
