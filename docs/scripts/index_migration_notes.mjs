#!/usr/bin/env node
// Post-build: writes `migration_notes.json` beside every `migration_notes.md` twin, the per-version
// section index that netlify/edge-functions/migration-notes-range.mjs and the page's copy panel
// read. It reads the twin, not the source, so each section is the exact text the twin serves.
//
//   node scripts/index_migration_notes.mjs [build-dir]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fences from "../src/markdown_fences.js";
import { compareVersions, parseVersion } from "../src/migration_ranges.mjs";

const TWIN = "migration_notes.md";
// Generated API reference, never a docs page.
const SKIP_DIRS = new Set(["typescript-api", "aztec-nr-api"]);

/**
 * Cuts the page at its version headings (`## 6.0.0`, `## TBD`) outside code fences. Topic headings
 * of any level stay in the section above them, and `preamble` + every section's markdown is the
 * page, byte for byte.
 *
 * @param {string} markdown
 * @returns {{preamble: string, sections: {version: string, markdown: string}[]}}
 * @throws when the page has no version heading, or its versions do not run strictly newest first
 *   (which catches a new entry put in the wrong place)
 */
export function splitSections(markdown) {
  const lines = markdown.split("\n");
  const fenced = fences.fencedLines(lines);
  const starts = [];
  let offset = 0;
  lines.forEach((line, i) => {
    const heading = fenced[i] ? null : /^## (\S+)[ \t]*$/.exec(line);
    const version = heading && parseVersion(heading[1]);
    if (version) {
      const previous = starts.at(-1);
      if (previous && compareVersions(version, previous.parsed) >= 0) {
        throw new Error(`${heading[1]} is listed after ${previous.version}: versions must run newest first, each once`);
      }
      starts.push({ version: heading[1], parsed: version, offset });
    }
    offset += line.length + 1;
  });
  if (!starts.length) throw new Error("no version heading (`## <version>` or `## TBD`)");
  return {
    preamble: markdown.slice(0, starts[0].offset),
    sections: starts.map(({ version, offset }, i) => ({ version, markdown: markdown.slice(offset, starts[i + 1]?.offset) })),
  };
}

function* twins(dir, root = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !(dir === root && SKIP_DIRS.has(entry.name))) yield* twins(full, root);
    else if (entry.isFile() && entry.name === TWIN) yield full;
  }
}

/**
 * @param {string} buildDir
 * @returns {string[]} the index files written, relative to `buildDir`
 * @throws when the build has no migration notes twin or one does not split
 */
export function indexMigrationNotes(buildDir) {
  const written = [];
  for (const twin of twins(buildDir)) {
    const rel = path.relative(buildDir, twin).split(path.sep).join("/");
    let sections;
    try {
      ({ sections } = splitSections(fs.readFileSync(twin, "utf8")));
    } catch (error) {
      throw new Error(`${rel}: ${error.message}`);
    }
    fs.writeFileSync(twin.replace(/\.md$/, ".json"), JSON.stringify({ sections }));
    written.push(rel.replace(/\.md$/, ".json"));
  }
  if (!written.length) throw new Error(`no ${TWIN} twin under ${buildDir}`);
  return written.sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const buildDir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "build"));
  for (const file of indexMigrationNotes(buildDir)) console.log(`migration notes index: ${file}`);
}
