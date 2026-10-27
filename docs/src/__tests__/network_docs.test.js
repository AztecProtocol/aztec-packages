const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { docsInstances, llmsRoutes, networkSection, syncVersionsFile } = require("../network_docs");

const split = { mainnet: "v5.2.0", testnet: "v6.0.0-rc.3" };
const shared = { mainnet: "v6.0.0", testnet: "v6.0.0" };

describe("networks on different versions", () => {
  const [developer, operator] = docsInstances(split, split, true);

  it("labels each version's pages and excludes versions no network reads", () => {
    assert.deepStrictEqual(llmsRoutes(developer, ["v5.2.0", "v6.0.0-rc.3", "v4.2.0"]), {
      routeRules: [
        { route: "/developers/**", categoryName: "Developer docs: mainnet (v5.2.0)" },
        { route: "/developers/testnet/**", categoryName: "Developer docs: testnet (v6.0.0-rc.3)", depth: 2 },
      ],
      excludeRoutes: ["/developers/v4.2.0/**"],
    });
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
      routeRules: [{ route: "/developers/**", categoryName: "Developer docs: mainnet and testnet (v6.0.0)" }],
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
        ["/operate/alpha/**", "Operator docs: mainnet (v5.2.0)"],
        ["/operate/testnet/**", "Operator docs: testnet (v6.0.0-rc.3)"],
        ["/operate/**", "Operator docs: unreleased"],
      ],
    );
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
