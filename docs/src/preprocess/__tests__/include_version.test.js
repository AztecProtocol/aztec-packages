const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { preprocessIncludeVersion, getReleaseVersion, getReleaseNetwork } = require("../include_version");

describe("getReleaseVersion", () => {
  const tags = ["1.0.0", "2.0.0", "3.0.0", "4.0.0"]; // [nightly, devnet, testnet, mainnet]

  const testCases = [
    ["nightly", "1.0.0"],
    ["devnet", "2.0.0"],
    ["testnet", "3.0.0"],
    ["mainnet", "4.0.0"],
  ];

  testCases.forEach(([releaseType, expected]) => {
    it(`returns ${expected} for ${releaseType}`, () => {
      assert.strictEqual(getReleaseVersion(releaseType, ...tags), expected);
    });
  });

  it("strips v prefix", () => {
    assert.strictEqual(getReleaseVersion("nightly", "v1.0.0", "2.0.0", "3.0.0", "4.0.0"), "1.0.0");
  });

  it("throws for invalid release type", () => {
    assert.throws(() => getReleaseVersion("invalid", ...tags), /Invalid RELEASE_TYPE/);
  });
});

describe("getReleaseNetwork", () => {
  const testCases = [
    ["nightly", "local-network"],
    ["devnet", "devnet"],
    ["testnet", "testnet"],
    ["mainnet", "mainnet"],
  ];

  testCases.forEach(([releaseType, expected]) => {
    it(`returns ${expected} for ${releaseType}`, () => {
      assert.strictEqual(getReleaseNetwork(releaseType), expected);
    });
  });

  it("throws for invalid release type", () => {
    assert.throws(() => getReleaseNetwork("invalid"), /Invalid RELEASE_TYPE/);
  });
});

describe("preprocessIncludeVersion", () => {
  let originalEnv;
  beforeEach(() => { originalEnv = { ...process.env }; });
  afterEach(() => { process.env = originalEnv; });

  const setEnv = (vars) => Object.assign(process.env, vars);

  describe("#release_version macro", () => {
    const testCases = [
      ["nightly", { NIGHTLY_TAG: "v3.0.0-nightly.1" }, "3.0.0-nightly.1"],
      ["devnet", { DEVNET_TAG: "3.0.0-devnet.5" }, "3.0.0-devnet.5"],
      ["testnet", { TESTNET_TAG: "2.1.11" }, "2.1.11"],
      ["mainnet", { MAINNET_TAG: "2.1.11" }, "2.1.11"],
    ];

    testCases.forEach(([releaseType, envVars, expected]) => {
      it(`resolves to ${expected} for ${releaseType}`, async () => {
        setEnv({ RELEASE_TYPE: releaseType, ...envVars });
        const { content } = await preprocessIncludeVersion("#release_version", "test.md");
        assert.strictEqual(content, expected);
      });
    });

    it("falls back to COMMIT_TAG when NIGHTLY_TAG not set", async () => {
      setEnv({ RELEASE_TYPE: "nightly", COMMIT_TAG: "v2.0.0-test" });
      delete process.env.NIGHTLY_TAG;
      const { content } = await preprocessIncludeVersion("#release_version", "test.md");
      assert.strictEqual(content, "2.0.0-test");
    });
  });

  describe("#release_network macro", () => {
    const testCases = [
      ["nightly", "local-network"],
      ["devnet", "devnet"],
      ["testnet", "testnet"],
      ["mainnet", "mainnet"],
    ];

    testCases.forEach(([releaseType, expected]) => {
      it(`resolves to ${expected} for ${releaseType}`, async () => {
        setEnv({ RELEASE_TYPE: releaseType });
        const { content } = await preprocessIncludeVersion("#release_network", "test.md");
        assert.strictEqual(content, expected);
      });
    });
  });

  describe("#release_name and #release_label macros", () => {
    it("resolve to the release line name for a named major", async () => {
      setEnv({ RELEASE_TYPE: "mainnet", MAINNET_TAG: "v6.0.0" });
      const { content } = await preprocessIncludeVersion("#release_name / #release_label", "test.md");
      assert.strictEqual(content, "Tierra / Tierra (v6.0.0)");
    });

    it("cover every minor of the line", async () => {
      setEnv({ RELEASE_TYPE: "testnet", TESTNET_TAG: "6.3.1" });
      const { content } = await preprocessIncludeVersion("#release_label", "test.md");
      assert.strictEqual(content, "Tierra (v6.3.1)");
    });

    it("fall back to the version for an unnamed line", async () => {
      setEnv({ RELEASE_TYPE: "mainnet", MAINNET_TAG: "v5.2.0" });
      const { content } = await preprocessIncludeVersion("#release_name / #release_label", "test.md");
      assert.strictEqual(content, "v5.2.0 / v5.2.0");
    });

    it("do not clobber #release_network", async () => {
      setEnv({ RELEASE_TYPE: "mainnet", MAINNET_TAG: "v6.0.0" });
      const { content } = await preprocessIncludeVersion("#release_network #release_name", "test.md");
      assert.strictEqual(content, "mainnet Tierra");
    });
  });

  describe("legacy macros", () => {
    it("#include_aztec_version uses COMMIT_TAG", async () => {
      setEnv({ RELEASE_TYPE: "nightly", COMMIT_TAG: "v1.2.3" });
      const { content } = await preprocessIncludeVersion("#include_aztec_version", "test.md");
      assert.strictEqual(content, "v1.2.3");
    });

    it("#include_version_without_prefix strips v", async () => {
      setEnv({ RELEASE_TYPE: "nightly", COMMIT_TAG: "v1.2.3" });
      const { content } = await preprocessIncludeVersion("#include_version_without_prefix", "test.md");
      assert.strictEqual(content, "1.2.3");
    });

    it("without COMMIT_TAG, names the pinned aztec-node tag, independent of NIGHTLY_TAG", async () => {
      const { ref } = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../aztec-node.json"), "utf8"));
      setEnv({ RELEASE_TYPE: "nightly", NIGHTLY_TAG: "v9.9.9-nightly.1" });
      delete process.env.COMMIT_TAG;
      const { content } = await preprocessIncludeVersion(
        "#include_aztec_version #include_version_without_prefix #release_version",
        "test.md",
      );
      assert.strictEqual(content, `${ref} ${ref.slice(1)} 9.9.9-nightly.1`);
    });

    const versionMacros = [
      ["#include_devnet_version", "DEVNET_TAG", "3.0.0-devnet.5"],
      ["#include_testnet_version", "TESTNET_TAG", "2.1.11"],
      ["#include_mainnet_version", "MAINNET_TAG", "2.1.11"],
    ];

    versionMacros.forEach(([macro, envVar, value]) => {
      it(`${macro} uses ${envVar}`, async () => {
        setEnv({ RELEASE_TYPE: "nightly", [envVar]: value });
        const { content } = await preprocessIncludeVersion(macro, "test.md");
        assert.strictEqual(content, value);
      });
    });
  });

  describe("#include_foundation_version macro", () => {
    const installed = JSON.parse(fs.readFileSync(
      path.join(__dirname, "../../../node_modules/@aztec-foundation/l1-artifacts/package.json"),
      "utf8",
    )).version;

    ["nightly", "testnet"].forEach((releaseType) => {
      it(`names the installed l1-artifacts release for ${releaseType}, not COMMIT_TAG`, async () => {
        setEnv({ RELEASE_TYPE: releaseType, COMMIT_TAG: "v9.9.9" });
        const { content } = await preprocessIncludeVersion("blob/#include_foundation_version/l1-contracts", "test.md");
        assert.strictEqual(content, `blob/v${installed}/l1-contracts`);
      });
    });

    it("#include_foundation_version_without_prefix drops the v", async () => {
      setEnv({ RELEASE_TYPE: "testnet" });
      const { content } = await preprocessIncludeVersion(
        "l1-artifacts@#include_foundation_version_without_prefix #include_foundation_version",
        "test.md",
      );
      assert.strictEqual(content, `l1-artifacts@${installed} v${installed}`);
    });
  });

  describe("#api_ref_version macro", () => {
    // Only testnet and mainnet API references are published; other builds use the generated next/.
    // A network links the folder the build serves for its version, which it shares with any network
    // on the same version.
    const { apiReferenceDirs, docsInstances } = require("../../network_docs");
    const config = require("../../../developer_version_config.json");
    const served = (network) =>
      apiReferenceDirs(docsInstances(config, {}, true)[0]).find((d) => d.networks.includes(network)).folder;
    const testCases = [
      ["nightly", "next"],
      ["devnet", "next"],
      ["testnet", served("testnet")],
      ["mainnet", served("mainnet")],
    ];

    const TAGS = ["NIGHTLY_TAG", "DEVNET_TAG", "TESTNET_TAG", "MAINNET_TAG", "KEEP_DEVELOPER_VERSIONS"];
    const apiRefVersion = async (vars) => {
      for (const v of TAGS) delete process.env[v];
      setEnv(vars);
      return (await preprocessIncludeVersion("#api_ref_version", "test.md")).content;
    };

    testCases.forEach(([releaseType, expected]) => {
      it(`resolves to ${expected} for ${releaseType}`, async () => {
        assert.strictEqual(await apiRefVersion({ RELEASE_TYPE: releaseType }), expected);
      });
    });

    // A release cut freezes these links into its snapshot before it maps the new version, so they
    // name the folder the build serves once the release type reads the version being built.
    it("names testnet's own folder for a testnet release on a version mainnet does not run", async () => {
      assert.strictEqual(await apiRefVersion({ RELEASE_TYPE: "testnet", TESTNET_TAG: "999.0.0" }), "testnet");
    });

    it("names mainnet's folder for a testnet release on mainnet's version", async () => {
      assert.strictEqual(await apiRefVersion({ RELEASE_TYPE: "testnet", TESTNET_TAG: config.mainnet }), "mainnet");
    });

    it("keeps the folder the developer versions serve now when the release does not change them", async () => {
      assert.strictEqual(
        await apiRefVersion({ RELEASE_TYPE: "testnet", TESTNET_TAG: "999.0.0", KEEP_DEVELOPER_VERSIONS: "1" }),
        served("testnet"),
      );
    });
  });

  describe("on a line page", () => {
    const config = require("../../../developer_version_config.json");
    const major = Number(config.mainnet.match(/^v(\d+)\./)[1]);
    let rootDir;
    beforeEach(() => {
      rootDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "include-version-"));
      for (const line of [`v${major}`, "v999"]) {
        const pin = { ref: `${line}.1.0-nightly.20260101`, toolchain: { l1Artifacts: `${line.slice(1)}.1.0` } };
        fs.mkdirSync(path.join(rootDir, "docs/lines", line), { recursive: true });
        fs.writeFileSync(path.join(rootDir, "docs/lines", line, "aztec-node.json"), JSON.stringify(pin));
      }
    });
    afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));
    const page = (line) => path.join(rootDir, "docs/lines", line, "docs-developers/page.md");

    it("takes its versions from the line's pin and its API folder from the network on its major", async () => {
      setEnv({ RELEASE_TYPE: "mainnet", COMMIT_TAG: "v9.9.9" });
      const { content } = await preprocessIncludeVersion(
        "#include_aztec_version #include_foundation_version #api_ref_version",
        page(`v${major}`),
        rootDir,
      );
      assert.strictEqual(content, `v${major}.1.0-nightly.20260101 v${major}.1.0 mainnet`);
    });

    it("fails closed on #api_ref_version when no network runs the line's major", async () => {
      await assert.rejects(preprocessIncludeVersion("#api_ref_version", page("v999"), rootDir), /no network runs v999.*retire the line/);
      assert.strictEqual((await preprocessIncludeVersion("#include_aztec_version", page("v999"), rootDir)).content, "v999.1.0-nightly.20260101");
    });
  });

  describe("integration", () => {
    it("processes conditionals before version macros", async () => {
      setEnv({ RELEASE_TYPE: "devnet", DEVNET_TAG: "3.0.0-devnet.5" });
      const input = `#if(devnet)\n#release_version\n#else\nunknown\n#endif`;
      const { content } = await preprocessIncludeVersion(input, "test.md");
      assert.strictEqual(content, "3.0.0-devnet.5");
    });

    it("replaces multiple macros", async () => {
      setEnv({ RELEASE_TYPE: "devnet", DEVNET_TAG: "3.0.0-devnet.5" });
      const { content } = await preprocessIncludeVersion("#release_version #release_network", "test.md");
      assert.strictEqual(content, "3.0.0-devnet.5 devnet");
    });

    it("returns isUpdated correctly", async () => {
      setEnv({ RELEASE_TYPE: "nightly" });
      const { isUpdated: changed } = await preprocessIncludeVersion("#release_version", "test.md");
      const { isUpdated: unchanged } = await preprocessIncludeVersion("plain text", "test.md");
      assert.strictEqual(changed, true);
      assert.strictEqual(unchanged, false);
    });
  });
});
