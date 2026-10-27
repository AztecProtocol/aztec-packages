// Docusaurus appends an <a class="hash-link"> to every heading. As markdown it
// becomes `[​](#id "Direct link to …")` in every page the llms-txt plugin emits.

const isHashLink = (node) =>
  node.type === "element" &&
  node.tagName === "a" &&
  [].concat(node.properties?.className ?? []).includes("hash-link");

/** Rehype plugin: removes heading hash links from the tree. */
function rehypeDropHashLinks() {
  const drop = (node) => {
    if (!node.children) return;
    node.children = node.children.filter((child) => !isHashLink(child));
    node.children.forEach(drop);
  };
  return drop;
}

module.exports = rehypeDropHashLinks;
