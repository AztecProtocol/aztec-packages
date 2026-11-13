const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  apiReferenceDirs,
  apiReferenceFolder,
  aztecNrApiFolders,
  docsInstances,
  historicalVersions,
  lineApiFolder,
  lineInstances,
  llmsRoutes,
  networkApiFolder,
  networkSection,
  startHere,
  startHereLinks,
  syncVersionsFile,
} = require("../network_docs");
const { llmsSiteUrl } = require("../site_url");
const { versionLabel } = require("../release_names");
const { aztecNrApiFolder } = require("../utils/aztecNrApi.mjs");
const { lineDocsPath, lineNavbarProps } = require("../utils/docsLine.mjs");

const split = { mainnet: "v5.2.0", testnet: "v6.0.0-rc.3" };
const shared = { mainnet: "v6.0.0", testnet: "v6.0.0" };
// Testnet ahead on the next major, as when a release candidate is out.
const ahead = { mainnet: "v6.0.0", testnet: "v7.0.0-rc.1" };

describe("networks on different versions", () => {
  const [developer, operator] = docsInstances(split, split, true);

  it("labels each version's pages and excludes versions no network reads", () => {
    assert.deepStrictEqual(llmsRoutes(developer, ["v5.2.0", "v6.0.0-rc.3", "v4.2.0"]), {
      routeRules: [
        { route: "/developers/**", categoryName: "Developer docs: v5.2.0 on mainnet" },
        { route: "/developers/testnet/**", categoryName: "Developer docs: Tierra (v6.0.0-rc.3) on testnet", depth: 2 },
      ],
      excludeRoutes: ["/developers/v4.2.0/**"],
    });
  });


  it("names the cut versions no network reads", () => {
    assert.deepStrictEqual(historicalVersions(developer, ["v5.2.0", "v6.0.0-rc.3", "v4.2.0"]), ["v4.2.0"]);
  });

  it("states each network's version and docs paths", () => {
    const section = networkSection([developer, operator], "# Networks\n\n## Values\n", "https://x");
    assert.match(
      section,
      /^- \*\*mainnet\*\*: developer docs v5\.2\.0 at `\/developers\/` \(except `\/developers\/testnet\/`\); operator docs v5\.2\.0 at `\/operate\/` \(except `\/operate\/testnet\/`\)$/m,
    );
    assert.match(
      section,
      /^- \*\*testnet\*\*: developer docs v6\.0\.0-rc\.3 at `\/developers\/testnet\/`; operator docs v6\.0\.0-rc\.3 at `\/operate\/testnet\/`$/m,
    );
    assert.match(section, /^### Networks\n\n#### Values$/m);
  });
});

describe("networks on one version", () => {
  const [developer, operator] = docsInstances(shared, shared, true);

  it("lists the shared docs once", () => {
    assert.deepStrictEqual(llmsRoutes(developer, ["v6.0.0", "v5.2.0"]), {
      routeRules: [{ route: "/developers/**", categoryName: "Developer docs: Tierra (v6.0.0) on mainnet and testnet" }],
      excludeRoutes: ["/developers/v5.2.0/**"],
    });
    const lines = networkSection([developer, operator], "", "https://x").match(/^- .*/gm);
    assert.deepStrictEqual(lines, [
      "- **mainnet and testnet**: developer docs v6.0.0 at `/developers/`; operator docs v6.0.0 at `/operate/`",
    ]);
  });
});

describe("outside production", () => {
  it("sections the current docs apart from the network versions", () => {
    const [, operator] = docsInstances(split, split, false);
    assert.deepStrictEqual(
      llmsRoutes(operator, ["v5.2.0", "v6.0.0-rc.3"]).routeRules.map((r) => [r.route, r.categoryName]),
      [
        ["/operate/alpha/**", "Operator docs: v5.2.0 on mainnet"],
        ["/operate/testnet/**", "Operator docs: Tierra (v6.0.0-rc.3) on testnet"],
        ["/operate/**", "Operator docs: unreleased"],
      ],
    );
  });
});

describe("API reference folders", () => {
  it("name a version's folder after the version, except a stand-in's", () => {
    assert.deepStrictEqual(["v7.0.0-rc.1", "v6.0.0", "v5.2.0"].map(apiReferenceFolder), ["v7.0.0-rc.1", "v6.0.0", "v6.0.0"]);
  });

  it("map each version a network reads to its own folder", () => {
    assert.deepStrictEqual(aztecNrApiFolders(docsInstances(shared, shared, true)[0]), { "v6.0.0": "v6.0.0" });
    assert.deepStrictEqual(aztecNrApiFolders(docsInstances(ahead, ahead, true)[0]), {
      "v6.0.0": "v6.0.0",
      "v7.0.0-rc.1": "v7.0.0-rc.1",
    });
  });

  it("give each network the folder of its version, and a release type no network maps none", () => {
    const folders = (config) => ["mainnet", "testnet", "devnet"].map((type) => networkApiFolder(config, type));
    assert.deepStrictEqual(folders(shared), ["v6.0.0", "v6.0.0", undefined]);
    assert.deepStrictEqual(folders({ ...ahead, devnet: "v7.0.0-devnet.1" }), ["v6.0.0", "v7.0.0-rc.1", undefined]);
  });

  it("give a dev line the folder of the version a network reads on its major, and none without one", () => {
    assert.deepStrictEqual([6, 7, 8].map((major) => lineApiFolder(ahead, major)), ["v6.0.0", "v7.0.0-rc.1", undefined]);
  });

  it("serve every served version's folder once, stamped with the folder's own version", () => {
    const moved = { mainnet: "v6.1.0", testnet: "v6.1.0" };
    const dirs = apiReferenceDirs(docsInstances(moved, moved, true)[0], ["v6.1.0", "v6.0.0", "v5.2.0"]);
    assert.deepStrictEqual(
      dirs.map(({ kind, dir, version, networks }) => [kind, dir, version, networks]),
      [
        ["aztec-nr", "aztec-nr-api/v6.1.0", "v6.1.0", ["mainnet", "testnet"]],
        ["typescript", "typescript-api/v6.1.0", "v6.1.0", ["mainnet", "testnet"]],
        // Read by no network, and by v5.2.0 only through its stand-in: still served, still v6.0.0's.
        ["aztec-nr", "aztec-nr-api/v6.0.0", "v6.0.0", []],
        ["typescript", "typescript-api/v6.0.0", "v6.0.0", []],
      ],
    );
    assert.throws(() => apiReferenceDirs(docsInstances(moved, moved, true)[0]), /cut versions/);
  });

  it("send the API page of every cut version to a folder that exists, whatever its label", () => {
    const folders = Object.fromEntries(require("../../developer_versions.json").map((v) => [v, apiReferenceFolder(v)]));
    for (const version of Object.keys(folders)) {
      const folder = aztecNrApiFolder({ name: version, label: versionLabel(version) }, folders);
      const index = path.join(__dirname, "../../static/aztec-nr-api", folder, "noir_aztec/index.html");
      assert.ok(fs.existsSync(index), `${version} links into aztec-nr-api/${folder}/, which does not exist`);
    }
  });
});

describe("dev lines", () => {
  it("serve each line's developer and operator pages under their own base outside production only", () => {
    assert.deepStrictEqual(lineInstances(["v6"], true), []);
    assert.deepStrictEqual(lineInstances(["v6"], false), [
      { line: "v6", id: "developer-v6", source: "lines/v6/docs-developers", routeBasePath: "developers-v6", sidebar: "lines/v6/sidebars-developer.js" },
      { line: "v6", id: "network-v6", source: "lines/v6/docs-operate", routeBasePath: "operate-v6", sidebar: "lines/v6/sidebars-operate.js" },
    ]);
  });

  it("send a line's API page to its line's folder, and every other page where it went before", () => {
    const folders = { "v6.0.0": "v6.0.0", "v5.2.0": "v6.0.0" };
    const lines = { v6: "v6.0.0" };
    assert.strictEqual(aztecNrApiFolder({ name: "current" }, folders, "developer-v6", lines), "v6.0.0");
    assert.strictEqual(aztecNrApiFolder({ name: "current" }, folders, "developer", lines), "next");
    assert.strictEqual(aztecNrApiFolder({ name: "v6.0.0" }, folders, "developer", lines), "v6.0.0");
    assert.strictEqual(aztecNrApiFolder({ name: "v5.2.0" }, folders), "v6.0.0");
  });

  it("move a line's navigation into the dev docs onto the line, and nothing else", () => {
    assert.strictEqual(lineDocsPath("/developers/docs/aztec-js", "v6"), "/developers-v6/docs/aztec-js");
    assert.strictEqual(lineDocsPath("/operate", "v6"), "/operate-v6");
    for (const p of ["/developers-v6/overview", "/developersx", "/networks", "/participate/x", "https://example.com/developers/x"])
      assert.strictEqual(lineDocsPath(p, "v6"), p);
  });

  it("point a line's navbar items at the line, a dropdown's children before the dropdown sees them", () => {
    assert.deepStrictEqual(lineNavbarProps({ type: "docSidebar", docsPluginId: "developer", sidebarId: "sidebar" }, "v6"), {
      type: "docSidebar",
      docsPluginId: "developer-v6",
      sidebarId: "sidebar",
    });
    const participate = { type: "doc", docsPluginId: "participate", docId: "index" };
    assert.deepStrictEqual(lineNavbarProps(participate, "v6"), participate);
    const resources = {
      type: "dropdown",
      items: [
        { type: "html", value: "<span>Other Docs</span>" },
        { to: "/developers/ai_tooling", label: "AI Tooling" },
        { to: "https://github.com/AztecProtocol/aztec-starter", label: "Aztec Starter repo" },
      ],
    };
    assert.deepStrictEqual(lineNavbarProps(resources, "v6").items, [
      resources.items[0],
      { to: "/developers-v6/ai_tooling", label: "AI Tooling" },
      resources.items[2],
    ]);
  });
});

describe("Start here", () => {
  const urls = (production, siteUrl) =>
    Object.fromEntries(startHereLinks(docsInstances(shared, shared, production), siteUrl).map((l) => [l.title, l.url]));

  it("links the version production serves at each root", () => {
    const links = urls(true, "https://docs.aztec.network");
    assert.strictEqual(links["Running a full node"], "https://docs.aztec.network/operate/operators/setup/running_a_node.md");
    assert.strictEqual(links["Testing contracts"], "https://docs.aztec.network/developers/docs/aztec-nr/testing_contracts.md");
    assert.strictEqual(links["Aztec.nr API reference"], "https://docs.aztec.network/aztec-nr-api/v6.0.0/llms.txt");
    assert.strictEqual(
      links["Migration notes for a version range"],
      "https://docs.aztec.network/developers/docs/resources/migration_notes.md?from=5.2.0&to=6.0.0",
    );
  });

  it("follows a preview's host and layout, where the networks' operator docs are at /operate/alpha", () => {
    const siteUrl = llmsSiteUrl({ CONTEXT: "deploy-preview", DEPLOY_PRIME_URL: "https://preview.example/" });
    const links = urls(false, siteUrl);
    assert.strictEqual(links["Running a full node"], "https://preview.example/operate/alpha/operators/setup/running_a_node.md");
    assert.strictEqual(links["Getting started"], "https://preview.example/developers/getting_started_on_local_network.md");
  });

  it("drops the API entries when no network reads a version", () => {
    assert.strictEqual(urls(true, "https://x")["TypeScript API reference"], "https://x/typescript-api/v6.0.0/llms.txt");
    const none = startHereLinks(docsInstances({}, {}, false), "https://x").map((l) => l.title);
    assert.ok(!none.includes("Aztec.nr API reference") && none.includes("Getting started"));
  });

  it("renders one link line per entry and the docs each network reads", () => {
    const section = startHere(docsInstances(shared, shared, true), "https://x");
    assert.match(section, /^## Start here\n/);
    assert.match(section, /^- \[Testing contracts\]\(https:\/\/x\/developers\/docs\/aztec-nr\/testing_contracts\.md\): test a contract with `aztec test`/m);
    assert.match(section, /^- \*\*mainnet and testnet\*\*: developer docs v6\.0\.0 at `\/developers\/`/m);
  });
});

describe("llmsSiteUrl", () => {
  it("uses the deploy URL only in a deploy preview that has one", () => {
    assert.strictEqual(llmsSiteUrl({ CONTEXT: "deploy-preview", DEPLOY_PRIME_URL: "https://p.example" }), "https://p.example");
    assert.strictEqual(llmsSiteUrl({ CONTEXT: "deploy-preview", DEPLOY_PRIME_URL: "" }), "https://docs.aztec.network");
    assert.strictEqual(llmsSiteUrl({ CONTEXT: "production", DEPLOY_PRIME_URL: "https://p.example" }), "https://docs.aztec.network");
    assert.strictEqual(llmsSiteUrl({}), "https://docs.aztec.network");
  });
});

describe("syncVersionsFile", () => {
  it("lists a shared version once, keeps unmapped snapshots and drops versions without one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "versions-"));
    try {
      const configFile = path.join(dir, "config.json");
      const versionsFile = path.join(dir, "versions.json");
      const snapshots = path.join(dir, "versioned_docs");
      fs.writeFileSync(configFile, JSON.stringify({ ...shared, devnet: "v7.0.0" }));
      for (const v of ["v6.0.0", "v5.2.0"]) fs.mkdirSync(path.join(snapshots, `version-${v}`), { recursive: true });
      syncVersionsFile(configFile, versionsFile, snapshots);
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(versionsFile, "utf-8")), ["v6.0.0", "v5.2.0"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
