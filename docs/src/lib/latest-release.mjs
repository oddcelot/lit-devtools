// The newest release in the root CHANGELOG.md, for the hero's release pill
// and the sidebar's Changelog badge. Read from the changelog rather than
// package.json: the changelog section is what a reader lands on. A parser
// over the text, because the config reads the file from disk and the hero
// imports it with `?raw`, where a path from `import.meta.url` would point
// into the build output.

/** @param {string} changelog The text of CHANGELOG.md. */
export const latestRelease = (changelog) => {
  const [, version, date] =
    /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})$/m.exec(changelog) ?? [];
  if (!version || !date) {
    throw new Error('CHANGELOG.md has no `## X.Y.Z — YYYY-MM-DD` heading');
  }
  return {
    version,
    date,
    path: releasePath(version),
  };
};

/** Every `X.Y.Z` with a section in CHANGELOG.md, newest first. */
export const releasedVersions = (changelog) =>
  [...changelog.matchAll(/^## (\d+\.\d+\.\d+) — /gm)].map(([, v]) => v);

/**
 * A release's page from starlight-changelogs, without the site base.
 * @param {string} version
 */
export const releasePath = (version) =>
  `/reference/changelog/version/${version.replaceAll('.', '-')}/`;
