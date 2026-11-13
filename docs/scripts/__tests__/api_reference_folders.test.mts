import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import networkDocs from "../../src/network_docs.js";

const { API_REFERENCE_STAND_INS, apiReferenceDirs, apiReferenceFolder, docsInstances } = networkDocs;
const docs = path.join(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(docs, file), "utf8");
const ROOTS = ["aztec-nr-api", "typescript-api"];
// The landing pages check_static_redirects.sh keeps in scope (folder_page_re): listed in the inventory, deleting
// their folder needs a redirect.
const FOLDER_PAGES = (folder: string) => [`aztec-nr-api/${folder}/index.html`, `typescript-api/${folder}/aztec.js.md`];
const REQUIRED = (folder: string) => [...FOLDER_PAGES(folder), `aztec-nr-api/${folder}/noir_aztec/index.html`];
// Previews and `yarn start` generate it, and .gitignore keeps it out of a commit.
const PREVIEW_ONLY = "aztec-nr-api/next";

type Tree = { staticDir: string; served: string[]; versions: string[]; standIns: Record<string, string>; listed: string[] };

// `served` are the folders some docs version links; `versions` are the docs versions the site serves; `listed` is
// snapshots/published-static.txt.
function folderProblems({ staticDir, served, versions, standIns, listed }: Tree): string[] {
  const problems = [
    ...served.flatMap(REQUIRED).filter((file) => !fs.existsSync(path.join(staticDir, file))).map((file) => `static/${file} is missing`),
    ...served.flatMap(FOLDER_PAGES).filter((file) => !listed.includes(file)).map((file) => `${file} is not in snapshots/published-static.txt: add it`),
  ];
  for (const version of Object.keys(standIns))
    if (!versions.includes(version)) problems.push(`${version} is no served docs version: remove its API_REFERENCE_STAND_INS entry`);
  for (const root of ROOTS)
    for (const folder of fs.existsSync(path.join(staticDir, root)) ? fs.readdirSync(path.join(staticDir, root)) : [])
      if (`${root}/${folder}` !== PREVIEW_ONLY && !served.includes(folder))
        problems.push(`static/${root}/${folder} is linked by no served docs version: delete it and redirect its URLs`);
  return problems;
}

test("static/ holds the API reference folder of every served docs version, and no other", () => {
  const config = JSON.parse(read("developer_version_config.json"));
  const cut: string[] = JSON.parse(read("developer_versions.json"));
  const [developer] = docsInstances(config, config, true);
  const served = [...new Set(apiReferenceDirs(developer, cut).map(({ version }: { version: string }) => version))];
  const versions = [...new Set([...cut, ...Object.values(config).filter(Boolean)])] as string[];
  const listed = read("snapshots/published-static.txt").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  assert.deepEqual(folderProblems({ staticDir: path.join(docs, "static"), served, versions, standIns: API_REFERENCE_STAND_INS, listed }), []);
});

test("a missing file, an unlisted folder page, an unlinked folder and a stand-in for a retired version each fail", () => {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-reference-folders-"));
  try {
    for (const file of [...REQUIRED("v2.0.0"), "aztec-nr-api/v1.0.0/noir_aztec/index.html", `${PREVIEW_ONLY}/index.html`, "typescript-api/next/aztec.js.md"]) {
      fs.mkdirSync(path.dirname(path.join(staticDir, file)), { recursive: true });
      fs.writeFileSync(path.join(staticDir, file), "");
    }
    const listed = [...FOLDER_PAGES("v2.0.0"), "aztec-nr-api/v1.0.0/index.html"];
    const problems = folderProblems({ staticDir, served: ["v2.0.0", "v1.0.0"], versions: ["v2.0.0", "v1.0.0"], standIns: { "v0.9.0": "v1.0.0" }, listed });
    assert.deepEqual(problems, [
      "static/aztec-nr-api/v1.0.0/index.html is missing",
      "static/typescript-api/v1.0.0/aztec.js.md is missing",
      "typescript-api/v1.0.0/aztec.js.md is not in snapshots/published-static.txt: add it",
      "v0.9.0 is no served docs version: remove its API_REFERENCE_STAND_INS entry",
      "static/typescript-api/next is linked by no served docs version: delete it and redirect its URLs",
    ]);
  } finally {
    fs.rmSync(staticDir, { recursive: true, force: true });
  }
});

// A folder ends where its URL does or at `/`, `?` or `#`; a `<version>` placeholder in prose is not a link.
const API_LINK = /(?<![\w-])(aztec-nr-api|typescript-api)\/(#api_ref_version|[^/\s)"'`?#<>]+)(?=[/\s)"'`?#<>]|$)/g;
// The Aztec.nr API page's folder, resolved at runtime from the active docs version (aztecNrApiFolder).
const RUNTIME_FOLDER = `\${apiVersion}`;
// Preprocessing follows a symlinked page, so the check does too.
const isPage = (e: fs.Dirent) =>
  /\.mdx?$/.test(e.name) && (e.isFile() || (e.isSymbolicLink() && fs.statSync(path.join(e.parentPath, e.name)).isFile()));
const pages = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true, recursive: true }).filter(isPage).map((e) => path.join(e.parentPath, e.name)).sort()
    : [];

// A source page names `#api_ref_version`, since the cut freezes it into its snapshot as the version being
// released; a snapshot names its own version's folder.
function linkProblems(root: string): string[] {
  const lineDirs = fs.existsSync(path.join(root, "lines")) ? fs.readdirSync(path.join(root, "lines")).map((l) => `lines/${l}`) : [];
  const dirs: [string, string][] = [
    ...["docs", "docs-participate", "docs-developers", "docs-operate", ...lineDirs.flatMap((l) => [`${l}/docs-developers`, `${l}/docs-operate`])].map(
      (d): [string, string] => [d, "#api_ref_version"],
    ),
    ...["developer_versioned_docs", "network_versioned_docs"].flatMap((d) =>
      (fs.existsSync(path.join(root, d)) ? fs.readdirSync(path.join(root, d)) : [])
        .filter((v) => v.startsWith("version-"))
        .map((v): [string, string] => [`${d}/${v}`, apiReferenceFolder(v.slice("version-".length))]),
    ),
  ];
  const problems: string[] = [];
  for (const [dir, expected] of dirs)
    for (const file of pages(path.join(root, dir)))
      fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        for (const [, apiRoot, folder] of line.matchAll(API_LINK))
          if (folder !== expected && folder !== RUNTIME_FOLDER)
            problems.push(`${path.relative(root, file)}:${i + 1}: links ${apiRoot}/${folder}/, expected ${apiRoot}/${expected}/`);
      });
  return problems;
}

test("every page links its own version's API reference folder", () => {
  assert.deepEqual(linkProblems(docs), []);
});

test("a network, literal or interpolated folder in a source page and another version's folder in a snapshot each fail", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "api-reference-links-"));
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  try {
    write(
      "docs-developers/a.md",
      "[ok](pathname:///aztec-nr-api/#api_ref_version/llms.txt)\n[net](https://docs.aztec.network/aztec-nr-api/mainnet/llms.txt)\n" +
        "Generated into `static/aztec-nr-api/<version>/`.\n[root](pathname:///aztec-nr-api/v6.0.0)\n",
    );
    write("outside/wrong.md", "[old](pathname:///typescript-api/v5.2.0/llms.txt)\n");
    fs.symlinkSync(path.join(root, "outside/wrong.md"), path.join(root, "docs-developers/linked.md"));
    write("lines/v6/docs-developers/b.mdx", `const href = \`/aztec-nr-api/\${apiVersion}/x\`;\nconst old = \`/aztec-nr-api/\${old}/x\`;\n<a href="/typescript-api/v6.0.0/aztec.js.md">x</a>\n`);
    write("developer_versioned_docs/version-v2.0.0/c.md", "[ok](pathname:///aztec-nr-api/v2.0.0/x)\n[old](pathname:///typescript-api/v1.0.0/x)\n");
    assert.deepEqual(linkProblems(root), [
      "docs-developers/a.md:2: links aztec-nr-api/mainnet/, expected aztec-nr-api/#api_ref_version/",
      "docs-developers/a.md:4: links aztec-nr-api/v6.0.0/, expected aztec-nr-api/#api_ref_version/",
      "docs-developers/linked.md:1: links typescript-api/v5.2.0/, expected typescript-api/#api_ref_version/",
      `lines/v6/docs-developers/b.mdx:2: links aztec-nr-api/\${old}/, expected aztec-nr-api/#api_ref_version/`,
      "lines/v6/docs-developers/b.mdx:3: links typescript-api/v6.0.0/, expected typescript-api/#api_ref_version/",
      "developer_versioned_docs/version-v2.0.0/c.md:2: links typescript-api/v1.0.0/, expected typescript-api/v2.0.0/",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const generatorFolder = (...args: string[]) =>
  spawnSync("bash", ["-c", 'source scripts/lib/aztec_node.sh && api_reference_folder "$@"', "_", ...args], { cwd: docs, encoding: "utf8" });

test("a generator writes its version's folder, next without one, and refuses a network name or a path", () => {
  assert.deepEqual([[], ["v6.1.0"], ["v7.0.0-rc.1"]].map((args) => generatorFolder(...args).stdout), ["next\n", "v6.1.0\n", "v7.0.0-rc.1\n"]);
  for (const bad of ["mainnet", "devnet", "6.1.0", "v6.1.0/../../docs"]) {
    const run = generatorFolder(bad);
    assert.equal(run.status, 1, bad);
    assert.match(run.stderr, /expected a docs version such as v6\.1\.0/, bad);
  }
});
