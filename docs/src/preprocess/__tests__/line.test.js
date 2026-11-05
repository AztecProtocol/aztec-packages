const { it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { lineLinks, lineOf } = require("../line");

it("finds a page's line from its path, and moves only its dev-docs links onto that line", () => {
  const root = "/repo";
  const line = lineOf("/repo/docs/lines/v6/docs-operate/operators/index.mdx", root);
  assert.deepStrictEqual(line, { name: "v6", major: 6, root: path.join(root, "docs/lines/v6") });
  assert.deepStrictEqual(lineOf("docs/lines/v6/examples/a.ts", root), line);
  for (const main of ["/repo/docs/docs-operate/index.mdx", "docs/lines/README.md", "/elsewhere/docs/lines/v6/a.md"])
    assert.strictEqual(lineOf(main, root), null, main);

  const page =
    "[a](/operate/operators/setup) [b](/developers/docs/x#y) <a href=\"/operate/operators\">c</a> " +
    "[d](/participate/x) [e](https://docs.aztec.network/operate/x) [f](/developers-v6/x)";
  assert.strictEqual(
    lineLinks(page, line),
    "[a](/operate-v6/operators/setup) [b](/developers-v6/docs/x#y) <a href=\"/operate-v6/operators\">c</a> " +
      "[d](/participate/x) [e](https://docs.aztec.network/operate/x) [f](/developers-v6/x)",
  );
});
