const { describe, it } = require("node:test");
const assert = require("node:assert");
const { releaseNameFor, versionLabel } = require("../../release_names");

describe("releaseNameFor", () => {
  it("names every release of a named major, with or without a v prefix", () => {
    for (const version of ["v6.0.0", "6.0.0", "v6.4.2", "6.1.0-rc.1"]) {
      assert.strictEqual(releaseNameFor(version), "Tierra", version);
    }
  });

  it("returns null for an unnamed major", () => {
    assert.strictEqual(releaseNameFor("v5.2.0"), null);
  });

  it("returns null for something that is not a version", () => {
    assert.strictEqual(releaseNameFor("current"), null);
  });
});

describe("versionLabel", () => {
  it("combines the line name with the exact version", () => {
    assert.strictEqual(versionLabel("v6.0.0"), "Tierra (v6.0.0)");
    assert.strictEqual(versionLabel("6.0.0"), "Tierra (v6.0.0)");
  });

  it("falls back to the bare version for an unnamed line", () => {
    assert.strictEqual(versionLabel("v5.2.0"), "v5.2.0");
    assert.strictEqual(versionLabel("5.2.0"), "v5.2.0");
  });

  it("appends the network only when asked", () => {
    assert.strictEqual(versionLabel("v6.1.0", "Testnet"), "Tierra (v6.1.0) · Testnet");
    assert.strictEqual(versionLabel("v5.2.0", "Alpha"), "v5.2.0 · Alpha");
  });
});
