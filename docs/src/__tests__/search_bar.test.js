const { describe, it } = require("node:test");
const assert = require("node:assert");
const { contextTags } = require("../theme/SearchBar/search.mjs");

const ALWAYS = ["default", "docs-participate-current", "docs-root-current"];
const production = {
  developer: { names: ["v6.0.0", "v5.2.0"], latest: "v6.0.0" },
  network: { names: ["v6.0.0", "v5.2.0"], latest: "v6.0.0" },
};
// Outside production the operator docs serve their current version at the root.
const preview = {
  developer: { names: ["current", "v6.0.0", "v5.2.0"], latest: "v6.0.0" },
  network: { names: ["current", "v6.0.0"], latest: "current" },
};
const versioned = (developer, network) => [...ALWAYS, `docs-developer-${developer}`, `docs-network-${network}`];

describe("contextTags", () => {
  it("applies a versioned page's version to both doc sets", () => {
    assert.deepStrictEqual(
      contextTags({ active: { pluginId: "developer", version: "v5.2.0" }, versions: production }),
      versioned("v5.2.0", "v5.2.0"),
    );
    assert.deepStrictEqual(
      contextTags({ active: { pluginId: "network", version: "v5.2.0" }, preferred: "v6.0.0", versions: production }),
      versioned("v5.2.0", "v5.2.0"),
    );
    assert.deepStrictEqual(
      contextTags({ active: { pluginId: "developer", version: "current" }, versions: preview }),
      versioned("current", "current"),
    );
  });

  it("falls back to a doc set's latest version when it lacks the one being read", () => {
    assert.deepStrictEqual(
      contextTags({ active: { pluginId: "developer", version: "v5.2.0" }, versions: preview }),
      versioned("v5.2.0", "current"),
    );
  });

  it("uses the preferred developer version on unversioned pages, else the latest", () => {
    for (const pluginId of ["participate", "root"]) {
      assert.deepStrictEqual(
        contextTags({ active: { pluginId, version: "current" }, preferred: "v5.2.0", versions: production }),
        versioned("v5.2.0", "v5.2.0"),
      );
    }
    assert.deepStrictEqual(contextTags({ versions: production }), versioned("v6.0.0", "v6.0.0"));
  });
});
