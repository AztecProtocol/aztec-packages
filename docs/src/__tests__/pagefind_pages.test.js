const { describe, it } = require("node:test");
const assert = require("node:assert");
const { classifyPage, pageUrl, stampPage } = require("../plugins/pagefind/pages");

const API_DIRS = ["aztec-nr-api/mainnet/"];
const docsPage = (tag, body = "<p>Install the sandbox.</p>") =>
  `<html><head><meta data-rh=true name=docusaurus_tag content=${tag} />` +
  `<meta data-rh=true name=docsearch:docusaurus_tag content=${tag} /></head>` +
  `<body><nav>Docs</nav><main><article class="doc">${body}</article></main></body></html>`;
const apiPage = "<html><body><main><h1>Struct PrivateSet</h1></main></body></html>";

describe("classifyPage", () => {
  it("tags docs pages with Docusaurus's own tag", () => {
    for (const [rel, tag] of [
      ["developers/getting_started_on_testnet.html", "docs-developer-v6.0.0"],
      ["developers/v5.2.0/getting_started_on_testnet.html", "docs-developer-v5.2.0"],
      ["operate/v5.2.0/operators/setup/running_a_node.html", "docs-network-v5.2.0"],
      ["participate/basics/fees.html", "docs-participate-current"],
      ["index.html", "docs-root-current"],
    ]) {
      assert.deepStrictEqual(classifyPage(rel, docsPage(tag), API_DIRS), { tag, body: "article" }, rel);
    }
  });

  it("indexes only the configured API trees' item pages, ranked lower", () => {
    assert.deepStrictEqual(
      classifyPage("aztec-nr-api/mainnet/noir_aztec/state_vars/struct.PrivateSet.html", apiPage, API_DIRS),
      { tag: "default", body: "main", weight: "0.5" },
    );
    for (const rel of [
      "aztec-nr-api/testnet/noir_aztec/state_vars/struct.PrivateSet.html",
      "aztec-nr-api/mainnet/std/index.html",
      "aztec-nr-api/mainnet/protocol_types/constants/global.MAX_FIELD.html",
      "aztec-nr-api/mainnet/all.html",
    ]) {
      assert.strictEqual(classifyPage(rel, apiPage, API_DIRS), null, rel);
    }
  });

  it("skips tag listings, the 404 page and pages without a docs tag", () => {
    const tagged = docsPage("docs-developer-v6.0.0");
    assert.strictEqual(classifyPage("developers/tags.html", tagged, API_DIRS), null);
    assert.strictEqual(classifyPage("developers/v5.2.0/tags/aztec-js.html", tagged, API_DIRS), null);
    assert.strictEqual(classifyPage("404.html", docsPage("docs-root-current"), API_DIRS), null);
    assert.strictEqual(classifyPage("search.html", docsPage("default"), API_DIRS), null);
    assert.strictEqual(classifyPage("google0123.html", "google-site-verification: google0123.html", API_DIRS), null);
  });

  it("cannot be steered out of the filter attribute by a hostile tag value", () => {
    const html = docsPage(`'docs-developer-v6.0.0"><img src=x onerror=alert(1)>'`);
    const page = classifyPage("developers/x.html", html, API_DIRS);
    assert.deepStrictEqual(page, { tag: "docs-developer-v6.0.0", body: "article" });
  });
});

describe("stampPage", () => {
  it("marks the content element and leaves the rest of the page byte for byte", () => {
    const body = "<p>Use $&amp; or $' literally, and &lt;article&gt; is text.</p>";
    const html = docsPage("docs-developer-v6.0.0", body);
    const stamped = stampPage(html, { tag: "docs-developer-v6.0.0", body: "article" });
    assert.strictEqual(
      stamped,
      html.replace(
        '<article class="doc">',
        '<article data-pagefind-body class="doc"><span hidden data-pagefind-filter="docusaurus_tag:docs-developer-v6.0.0"></span>',
      ),
    );
  });

  it("weights API pages and fails on a page without its content element", () => {
    assert.match(
      stampPage(apiPage, { tag: "default", body: "main", weight: "0.5" }),
      /<main data-pagefind-body data-pagefind-weight="0\.5"><span hidden data-pagefind-filter="docusaurus_tag:default"><\/span><h1>/,
    );
    assert.strictEqual(stampPage("<html><body><mainland></mainland></body></html>", { tag: "default", body: "main" }), null);
  });
});

it("pageUrl maps built files to their served URLs", () => {
  assert.strictEqual(pageUrl("index.html"), "/");
  assert.strictEqual(pageUrl("participate.html"), "/participate");
  assert.strictEqual(pageUrl("developers/v5.2.0/docs/aztec-js.html"), "/developers/v5.2.0/docs/aztec-js");
  assert.strictEqual(pageUrl("aztec-nr-api/mainnet/index.html"), "/aztec-nr-api/mainnet/");
});
