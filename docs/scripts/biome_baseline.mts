// biome-baseline.json counts the Biome suppression directives in the linted files, by form and
// rule, for the exact Biome version package.json pins. Its test fails when a count rises, falls
// without the manifest following, or the version moves, so suppressions can only shrink.
// `node scripts/biome_baseline.mts write` regenerates the manifest from the tree.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Counts = Record<string, Record<string, number>>;
export type Baseline = { biome: string; suppressions: Counts };
export type Directive = { form: string; categories: string[] };

export const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASELINE_FILE = path.join(DOCS, "biome-baseline.json");
const BIOME_PACKAGE = "@biomejs/biome";

// `-end` closes a `-start` range and is not counted on its own.
const DIRECTIVE = /(?:\/\/|\/\*)\s*(biome-ignore(?:-all|-start|-end)?)\s+([^:\n]*?)\s*:/g;
const FULL_RULE = /^lint\/[a-zA-Z0-9]+\/[a-zA-Z0-9]+$/;

/** The suppression directives in `source`, in order. */
export function parseDirectives(source: string): Directive[] {
  return [...source.matchAll(DIRECTIVE)]
    .filter(([, form]) => form !== "biome-ignore-end")
    .map(([, form, categories]) => ({ form, categories: categories.split(/\s+/).filter(Boolean) }));
}

/** Whether `category` names one rule; `lint` or `lint/<group>` would hide rules nobody listed. */
export const isRule = (category: string) => FULL_RULE.test(category);

/** The files biome.json lints, relative to docs/, from its `files.includes`. */
export function lintedFiles(docs = DOCS): string[] {
  const includes: string[] = JSON.parse(fs.readFileSync(path.join(docs, "biome.json"), "utf8")).files.includes;
  // Only `<dir>/**/*.<ext>` and `*.<ext>`, where Biome's and Node's glob semantics agree.
  const unsupported = includes.filter((p) => !/^([\w-]+\/\*\*\/)?\*\.\w+$/.test(p));
  if (unsupported.length) throw new Error(`biome.json files.includes has patterns this counter cannot mirror: ${unsupported.join(", ")}`);
  return [...new Set(includes.flatMap((p) => fs.globSync(p, { cwd: docs })))].sort();
}

/** Directive counts keyed by `<form> <rule>`, then by file. */
export function countSuppressions(docs = DOCS): Counts {
  const counts: Counts = {};
  for (const file of lintedFiles(docs)) {
    for (const { form, categories } of parseDirectives(fs.readFileSync(path.join(docs, file), "utf8"))) {
      for (const category of categories) {
        const key = `${form} ${category}`;
        counts[key] ??= {};
        counts[key][file] = (counts[key][file] ?? 0) + 1;
      }
    }
  }
  return sortCounts(counts);
}

const sortCounts = (counts: Counts): Counts =>
  Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((key) => [key, Object.fromEntries(Object.entries(counts[key]).sort(([a], [b]) => a.localeCompare(b)))]),
  );

/** The exact Biome version docs/package.json pins; a range would let the judged rules drift. */
export function pinnedBiome(docs = DOCS): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(docs, "package.json"), "utf8"));
  const version: string | undefined = pkg.devDependencies?.[BIOME_PACKAGE];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`docs/package.json must pin ${BIOME_PACKAGE} to an exact version, not ${version}`);
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "write") {
    console.error("usage: node scripts/biome_baseline.mts write");
    process.exit(2);
  }
  const baseline: Baseline = { biome: pinnedBiome(), suppressions: countSuppressions() };
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
}
