const { it } = require("node:test");
const assert = require("node:assert");
const rehypeApiLinks = require("../rehype_api_links");

async function hrefs(html) {
  const { unified } = await import("unified");
  const rehypeParse = (await import("rehype-parse")).default;
  const tree = unified().use(rehypeParse, { fragment: true }).parse(html);
  rehypeApiLinks({ dirs: ["aztec-nr-api/v6.0.0"] })(tree);
  const found = [];
  const walk = (node) => {
    if (node.tagName === "a") found.push(node.properties.href);
    node.children?.forEach(walk);
  };
  walk(tree);
  return found;
}

it("points links into a converted reference folder at the markdown page", async () => {
  const links = [
    "/aztec-nr-api/v6.0.0/noir_aztec/macros/fn.aztec.html",
    "/aztec-nr-api/v6.0.0/noir_aztec/state_vars/struct.PublicMutable#read",
    "/aztec-nr-api/v6.0.0/noir_aztec/",
    "/aztec-nr-api/v6.0.0/llms.txt",
    "/aztec-nr-api/next/noir_aztec/index.html",
    "/developers/docs/aztec-nr",
  ];
  assert.deepStrictEqual(await hrefs(links.map((href) => `<a href="${href}">x</a>`).join("")), [
    "/aztec-nr-api/v6.0.0/noir_aztec/macros/fn.aztec.md",
    "/aztec-nr-api/v6.0.0/noir_aztec/state_vars/struct.PublicMutable.md#read",
    "/aztec-nr-api/v6.0.0/noir_aztec/index.md",
    "/aztec-nr-api/v6.0.0/llms.txt",
    "/aztec-nr-api/next/noir_aztec/index.html",
    "/developers/docs/aztec-nr",
  ]);
});
