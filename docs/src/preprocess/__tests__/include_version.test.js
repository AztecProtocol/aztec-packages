const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { preprocessIncludeVersion, getReleaseVersion, getReleaseNetwork } = require("../include_version");

describe("getReleaseVersion", () => {
  const tags = ["1.0.0", "2.0.0", "3.0.0", "4.0.0"]; // [nightly, devnet, testnet, mainnet]

  const testCases = [
    ["nightly", "1.0.0"],
    ["devnet", "2.0.0"],
    ["testnet", "3.0.0"],
    ["mainnet", "4.0.0"],
    ["ignition", "4.0.0"],
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
    ["ignition", "mainnet"],
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
      ["testnet", { TESTNET_TAG: "2.1.9" }, "2.1.9"],
      ["mainnet", { MAINNET_TAG: "2.1.9" }, "2.1.9"],
      ["ignition", { MAINNET_TAG: "2.1.9" }, "2.1.9"],
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
      ["ignition", "mainnet"],
    ];

    testCases.forEach(([releaseType, expected]) => {
      it(`resolves to ${expected} for ${releaseType}`, async () => {
        setEnv({ RELEASE_TYPE: releaseType });
        const { content } = await preprocessIncludeVersion("#release_network", "test.md");
        assert.strictEqual(content, expected);
      });
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

    const versionMacros = [
      ["#include_devnet_version", "DEVNET_TAG", "3.0.0-devnet.5"],
      ["#include_testnet_version", "TESTNET_TAG", "2.1.9"],
      ["#include_mainnet_version", "MAINNET_TAG", "2.1.9"],
    ];

    versionMacros.forEach(([macro, envVar, value]) => {
      it(`${macro} uses ${envVar}`, async () => {
        setEnv({ RELEASE_TYPE: "nightly", [envVar]: value });
        const { content } = await preprocessIncludeVersion(macro, "test.md");
        assert.strictEqual(content, value);
      });
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
