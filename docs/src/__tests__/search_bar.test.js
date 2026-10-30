const { describe, it } = require("node:test");
const assert = require("node:assert");
const { apiTitle, contextTags, excerptParts, safeHref, sectionLabel } = require("../theme/SearchBar/search.mjs");

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
  for (const url of ["https://evil.example/", "//evil.example/", "/\\evil.example/", "javascript:alert(1)", "developers", undefined]) {
    assert.strictEqual(safeHref(url), null, String(url));
  }
});

it("sectionLabel names each tag's doc set and version", () => {
  assert.strictEqual(sectionLabel("docs-developer-v5.2.0"), "Developer docs · v5.2.0");
  assert.strictEqual(sectionLabel("docs-network-current"), "Operator docs · dev");
  assert.strictEqual(sectionLabel("docs-participate-current"), "Participate");
  assert.strictEqual(sectionLabel("docs-root-current"), "");
  assert.strictEqual(sectionLabel("default"), "Aztec.nr API");
});

it("apiTitle names an API page by its kind and path", () => {
  assert.strictEqual(
    apiTitle("/aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PrivateSet"),
    "struct noir_aztec::state_vars::PrivateSet",
  );
  assert.strictEqual(apiTitle("/aztec-nr-api/testnet/noir_aztec/state_vars/"), "module noir_aztec::state_vars");
  assert.strictEqual(apiTitle("/aztec-nr-api/mainnet/"), null);
  assert.strictEqual(apiTitle("/developers/docs/aztec-js"), null);
});
