import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import networkDocs from "../../src/network_docs.js";

const { API_REFERENCE_STAND_INS, apiReferenceDirs, docsInstances } = networkDocs;
const docs = path.join(import.meta.dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(docs, file), "utf8");
const ROOTS = ["aztec-nr-api", "typescript-api"];
// Each served folder answers its root's landing page and package index.
const REQUIRED = (folder: string) => [`aztec-nr-api/${folder}/noir_aztec/index.html`, `typescript-api/${folder}/aztec.js.md`];
// Previews and `yarn start` generate it, and .gitignore keeps it out of a commit.
const PREVIEW_ONLY = "aztec-nr-api/next";

type Tree = { staticDir: string; served: string[]; versions: string[]; standIns: Record<string, string> };

// `served` are the folders some docs version links; `versions` are the docs versions the site serves.
function folderProblems({ staticDir, served, versions, standIns }: Tree): string[] {
  const problems = served.flatMap(REQUIRED).filter((file) => !fs.existsSync(path.join(staticDir, file))).map((file) => `static/${file} is missing`);
  for (const version of Object.keys(standIns))
    if (!versions.includes(version)) problems.push(`${version} is no served docs version: remove its API_REFERENCE_STAND_INS entry`);
  for (const root of ROOTS)
    for (const folder of fs.existsSync(path.join(staticDir, root)) ? fs.readdirSync(path.join(staticDir, root)) : [])
      if (`${root}/${folder}` !== PREVIEW_ONLY && !served.includes(folder))
        problems.push(`static/${root}/${folder} is linked by no served docs version: delete it and redirect its URLs`);
  return problems;
}

// Network URLs reach their version's folder through netlify.toml: netlify_redirects.test.mts.
test("static/ holds the API reference folder of every served docs version, and no other", () => {
  const config = JSON.parse(read("developer_version_config.json"));
  const cut: string[] = JSON.parse(read("developer_versions.json"));
  const [developer] = docsInstances(config, config, true);
  const served = [...new Set(apiReferenceDirs(developer, cut).map(({ version }: { version: string }) => version))];
  const versions = [...new Set([...cut, ...Object.values(config).filter(Boolean)])] as string[];
  assert.deepEqual(folderProblems({ staticDir: path.join(docs, "static"), served, versions, standIns: API_REFERENCE_STAND_INS }), []);
});

test("a missing file, an unlinked folder and a stand-in for a retired version each fail", () => {
  const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-reference-folders-"));
  try {
    for (const file of [...REQUIRED("v2.0.0"), "aztec-nr-api/v1.0.0/noir_aztec/index.html", `${PREVIEW_ONLY}/index.html`, "typescript-api/next/aztec.js.md"]) {
      fs.mkdirSync(path.dirname(path.join(staticDir, file)), { recursive: true });
      fs.writeFileSync(path.join(staticDir, file), "");
    }
    const problems = folderProblems({ staticDir, served: ["v2.0.0", "v1.0.0"], versions: ["v2.0.0", "v1.0.0"], standIns: { "v0.9.0": "v1.0.0" } });
    assert.deepEqual(problems, [
      "static/typescript-api/v1.0.0/aztec.js.md is missing",
      "v0.9.0 is no served docs version: remove its API_REFERENCE_STAND_INS entry",
      "static/typescript-api/next is linked by no served docs version: delete it and redirect its URLs",
    ]);
  } finally {
    fs.rmSync(staticDir, { recursive: true, force: true });
  }
});
