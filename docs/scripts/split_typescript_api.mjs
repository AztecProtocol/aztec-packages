// Splits each package file of the TypeScript API reference in a build (typescript-api/<folder>/<pkg>.md,
// up to 235 KB) into one page per exported name, <pkg>/<Name>.md, which an agent can fetch whole.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { apiReferenceDirs, docsInstances } = require("../src/network_docs.js");
const { llmsSiteUrl } = require("../src/site_url.js");
const { documentedPackages, npmName } = require("./typescript_api_generation/packages.js");

const KINDS = { Classes: "class", Interfaces: "interface", Functions: "function", Types: "type", Enums: "enum" };
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A package file's declarations in file order; sections other than the five kinds are skipped. */
export function declarations(markdown) {
  const found = [];
  let kind = null;
  let current = null;
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) fence = !fence;
    const section = !fence && line.match(/^## (.+)$/);
    const heading = !fence && line.match(/^### (.+)$/);
    if (section) {
      kind = KINDS[section[1].trim()] ?? null;
      current = null;
    } else if (heading && kind) {
      current = { name: heading[1].trim(), kind, lines: [] };
      found.push(current);
    } else {
      current?.lines.push(line);
    }
  }
  return found.map(({ name, kind, lines }) => ({ name, kind, body: lines.join("\n").trim() }));
}

/**
 * One page per exported name of a package. Names that differ only in case (`Logger` and `logger`)
 * share a page, named after the first spelling, so no two pages collide on a case-insensitive file
 * system and a lookup of either finds both.
 *
 * @param {string} markdown the package file
 * @param {{pkg: string, npmName: string, version: string, index: string}} options `index` is the
 *   scoped llms.txt URL the banner names
 * @returns {{name: string, file: string, kinds: string[], markdown: string}[]}
 */
export function splitPackage(markdown, { pkg, npmName: npm, version, index }) {
  const groups = new Map();
  for (const declaration of declarations(markdown)) {
    if (!IDENTIFIER.test(declaration.name)) throw new Error(`${pkg}: "${declaration.name}" is not an identifier`);
    const key = declaration.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), declaration]);
  }
  return [...groups.values()].map((group) => {
    const [{ name }] = group;
    const kinds = [...new Set(group.map((d) => d.kind))];
    const page = [
      `> TypeScript API reference, \`${npm}\` ${version}. Index: ${index}`,
      `# ${name}`,
      `Package: \`${npm}\` (${kinds.join(", ")}). Most Aztec packages have no root export: import from the subpath that exports this name, as [aztec.js](/developers/docs/aztec-js.md) shows.`,
      ...group.map((d) => `## ${d.kind[0].toUpperCase()}${d.kind.slice(1)} ${d.name}\n\n${d.body}`),
    ];
    return { name, file: `${pkg}/${name}.md`, kinds, markdown: `${page.join("\n\n")}\n` };
  });
}

/** Splits every documented package of each TypeScript folder `apiReferenceDirs` lists; returns the exit code. */
export function main(buildDir, env = process.env) {
  const config = (name) => JSON.parse(fs.readFileSync(new URL(`../${name}_version_config.json`, import.meta.url), "utf8"));
  const [developer] = docsInstances(config("developer"), config("network"), env.CONTEXT === "production");
  let failed = false;
  for (const { kind, dir, version } of apiReferenceDirs(developer)) {
    if (kind !== "typescript") continue;
    const root = path.join(buildDir, dir);
    if (!fs.existsSync(root)) {
      console.error(`typescript split: ${dir} is not in the build`);
      failed = true;
      continue;
    }
    const index = `${llmsSiteUrl(env)}/${dir}/llms.txt`;
    let packages = 0;
    let pages = 0;
    for (const { name: pkg } of documentedPackages()) {
      const file = path.join(root, `${pkg}.md`);
      if (!fs.existsSync(file)) continue;
      const split = splitPackage(fs.readFileSync(file, "utf8"), { pkg, npmName: npmName(pkg), version, index });
      fs.mkdirSync(path.join(root, pkg), { recursive: true });
      for (const page of split) fs.writeFileSync(path.join(root, page.file), page.markdown);
      packages++;
      pages += split.length;
    }
    console.log(`typescript split: ${dir}: ${packages} packages, ${pages} pages`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = main(process.argv[2] ?? "build");
}
