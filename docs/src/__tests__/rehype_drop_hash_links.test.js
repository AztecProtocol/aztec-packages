const { it } = require("node:test");
const assert = require("node:assert");
const rehypeDropHashLinks = require("../rehype_drop_hash_links");

it("removes heading hash links and keeps every other link", () => {
  const link = (className, text) => ({
    type: "element",
    tagName: "a",
    properties: { href: "#x", className },
    children: [{ type: "text", value: text }],
  });
  const heading = {
    type: "element",
    tagName: "h2",
    properties: {},
    children: [
      { type: "text", value: "Install" },
      link(["hash-link"], "​"),
      link(["other"], "see"),
    ],
  };
  rehypeDropHashLinks()({ type: "root", children: [heading] });
  assert.deepStrictEqual(
    heading.children.map((c) => c.value ?? c.children[0].value),
    ["Install", "see"],
  );
});
