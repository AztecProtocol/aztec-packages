const { describe, it } = require("node:test");
const assert = require("node:assert");
const { contextTags, excerptParts, resultMeta, safeHref } = require("../theme/SearchBar/search.mjs");

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

describe("excerptParts", () => {
  it("honours only Pagefind's exact mark tokens", () => {
    assert.deepStrictEqual(excerptParts("a <mark>BoundedVec&lt;T,</mark> MaxLen&gt; & b"), [
      { text: "a ", mark: false },
      { text: "BoundedVec<T,", mark: true },
      { text: " MaxLen> & b", mark: false },
    ]);
  });

  it("returns hostile page text as plain text", () => {
    for (const [excerpt, text] of [
      ["&lt;img src=x onerror=alert(1)&gt;", "<img src=x onerror=alert(1)>"],
      ["&lt;/mark&gt;&lt;script&gt;alert(1)&lt;/script&gt;", "</mark><script>alert(1)</script>"],
      ['<mark onclick="alert(1)">x', '<mark onclick="alert(1)">x'],
    ]) {
      assert.deepStrictEqual(excerptParts(excerpt), [{ text, mark: false }], excerpt);
    }
  });
});

it("safeHref accepts same-origin paths only", () => {
  assert.strictEqual(safeHref("/developers/overview#install"), "/developers/overview#install");
  for (const url of [
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/\t/evil.example/",
    "/\r\n/evil.example/",
    "javascript:alert(1)",
    "developers",
    undefined,
  ]) {
    assert.strictEqual(safeHref(url), null, String(url));
  }
});

describe("resultMeta", () => {
  // Outside production: the operator docs serve their current version at the root.
  const versionPaths = ["/developers", "/developers/v5.2.0", "/developers/dev", "/operate/alpha", "/operate", "/participate", "/"];

  it("labels docs pages by section, version and the folders above them", () => {
    assert.deepStrictEqual(
      resultMeta("/developers/v5.2.0/docs/aztec-nr/framework-description/advanced/partial_notes", "docs-developer-v5.2.0", versionPaths),
      { section: "Build", version: "v5.2.0", trail: ["Framework description", "Advanced"], api: false },
    );
    assert.deepStrictEqual(
      resultMeta("/developers/docs/aztec-js/how_to_deploy_contract", "docs-developer-v6.0.0", versionPaths),
      { section: "Build", version: "v6.0.0", trail: ["Aztec js"], api: false },
    );
    assert.deepStrictEqual(
      resultMeta("/operate/operators/full-node/setup", "docs-network-current", versionPaths),
      { section: "Run a Node", version: "dev", trail: ["Operators", "Full node"], api: false },
    );
    assert.deepStrictEqual(resultMeta("/participate/basics/fees", "docs-participate-current", versionPaths), {
      section: "Participate",
      version: null,
      trail: ["Basics"],
      api: false,
    });
    assert.deepStrictEqual(resultMeta("/networks", "docs-root-current", versionPaths), {
      section: "",
      version: null,
      trail: [],
      api: false,
    });
  });

  it("titles API pages by kind and name, under their module path", () => {
    assert.deepStrictEqual(resultMeta("/aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PrivateSet", "default", versionPaths), {
      section: "Aztec.nr API",
      version: null,
      trail: ["noir_aztec", "state_vars"],
      api: true,
      title: "struct PrivateSet",
    });
    assert.deepStrictEqual(resultMeta("/aztec-nr-api/testnet/noir_aztec/state_vars/", "default", versionPaths), {
      section: "Aztec.nr API",
      version: null,
      trail: ["noir_aztec"],
      api: true,
      title: "module state_vars",
    });
    assert.deepStrictEqual(resultMeta("/aztec-nr-api/mainnet/", "default", versionPaths), {
      section: "Aztec.nr API",
      version: null,
      trail: [],
      api: true,
    });
  });
});
