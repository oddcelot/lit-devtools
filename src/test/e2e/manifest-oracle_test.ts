import {expect, test} from 'vite-plus/test';
import {manifestText} from '../../lib/component-docs/manifest-file.js';
import {scanSources} from '../../lib/component-docs/scan.js';
import {fsp, joinPath} from './utils.js';

/**
 * The generated manifest against `@custom-elements-manifest/analyzer` with
 * its Lit plugin, over real components: for every tag, the public fields,
 * methods, attributes, events, slots, parts and CSS properties each lists.
 * Drift in either reader shows up here as a named difference.
 *
 * Some differences are the analyzer's to own, or are out of scope for a
 * reader of top-level classes; `KNOWN` names each with the reason.
 */

const PACKAGE_ROOT = joinPath(import.meta.dirname, '../../..');

const PROJECTS = [
  {root: joinPath(PACKAGE_ROOT, 'playground'), dir: 'src'},
  {root: joinPath(PACKAGE_ROOT, 'packages/lit-components'), dir: 'src'},
];

/** Tag, or `tag.list`, to why the two readers disagree there. */
const KNOWN: Record<string, string> = {
  'hmr-static-props.attributes':
    'the analyzer gives a `state: true` static property an attribute; internal state has none',
  'hmr-not-defined':
    'defined by an anonymous class inside a method; only top-level classes are read',
  'lit-tree-node.events':
    'the analyzer names an event `type` after the variable in `new CustomEvent(type)`',
};

const LISTS = [
  'fields',
  'methods',
  'attributes',
  'events',
  'slots',
  'cssParts',
  'cssProperties',
] as const;

type Summary = Record<string, Record<(typeof LISTS)[number], string[]>>;

interface Member {
  kind: string;
  name: string;
  privacy?: string;
  static?: boolean;
}

interface Declaration {
  customElement?: boolean;
  tagName?: string;
  members?: Member[];
  [list: string]: unknown;
}

const names = (list: unknown): string[] =>
  ((list as {name: string}[] | undefined) ?? []).map((e) => e.name).sort();

const isPublic = (kind: string) => (member: Member) =>
  member.kind === kind &&
  member.privacy === undefined &&
  member.static !== true &&
  !member.name.startsWith('#');

const summarize = (manifest: {
  modules: {declarations?: Declaration[]}[];
}): Summary => {
  const out: Summary = {};
  for (const d of manifest.modules.flatMap((m) => m.declarations ?? [])) {
    if (d.customElement !== true || d.tagName === undefined) continue;
    const members = d.members ?? [];
    out[d.tagName] = {
      fields: names(members.filter(isPublic('field'))),
      methods: names(members.filter(isPublic('method'))),
      attributes: names(d.attributes),
      events: names(d.events),
      slots: names(d.slots),
      cssParts: names(d.cssParts),
      cssProperties: names(d.cssProperties),
    };
  }
  return out;
};

/** Every `.ts` file under `dir`, declaration files aside. */
const sources = async (dir: string): Promise<string[]> =>
  (await fsp.readdir(dir, {recursive: true}))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort()
    .map((file) => joinPath(dir, file));

const analyze = async (files: string[]) => {
  const {create, ts} = (await import('@custom-elements-manifest/analyzer')) as {
    create: (options: {modules: unknown[]; plugins: unknown[]}) => unknown;
    // The analyzer's own TypeScript 5; this repo's 7 has no compiler API types.
    ts: {
      createSourceFile: (
        file: string,
        text: string,
        target: number,
        setParents: boolean
      ) => unknown;
      ScriptTarget: {ES2015: number};
    };
  };
  // Not in the package's types; the CLI's `--litelement` loads the same.
  const litPath =
    '@custom-elements-manifest/analyzer/src/features/framework-plugins/lit/lit.js';
  const {litPlugin} = (await import(litPath)) as {litPlugin: () => unknown[]};
  const modules = await Promise.all(
    files.map(async (file) =>
      ts.createSourceFile(
        file,
        await fsp.readFile(file, 'utf8'),
        ts.ScriptTarget.ES2015,
        true
      )
    )
  );
  return create({modules, plugins: [...litPlugin()]}) as Parameters<
    typeof summarize
  >[0];
};

/** How one tag's lists differ, the known ones aside. */
const tagDifferences = (
  tag: string,
  theirs: Summary[string],
  ours: Summary[string]
): string[] =>
  LISTS.filter((list) => !(`${tag}.${list}` in KNOWN)).flatMap((list) => {
    const a = theirs[list].join(', ');
    const b = ours[list].join(', ');
    return a === b ? [] : [`${tag}.${list}: analyzer [${a}], ours [${b}]`];
  });

const differences = (theirs: Summary, ours: Summary): string[] =>
  [...new Set([...Object.keys(theirs), ...Object.keys(ours)])]
    .filter((tag) => !(tag in KNOWN))
    .flatMap((tag) => {
      if (theirs[tag] && ours[tag])
        return tagDifferences(tag, theirs[tag], ours[tag]);
      return [`${tag}: only in ${theirs[tag] ? 'the analyzer' : 'ours'}`];
    });

for (const project of PROJECTS) {
  test(`matches the analyzer over ${project.root.slice(PACKAGE_ROOT.length + 1)}`, async () => {
    const {index} = await scanSources({
      root: project.root,
      dirs: [project.dir],
    });
    const ours = summarize(JSON.parse(manifestText(index, project.root)));
    const theirs = summarize(
      await analyze(await sources(joinPath(project.root, project.dir)))
    );
    expect(Object.keys(ours).length).toBeGreaterThan(0);
    expect(differences(theirs, ours)).toEqual([]);
  }, 60_000);
}
