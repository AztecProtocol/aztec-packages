// Docusaurus renders each code line as a div.token-line ending in <br>, with the language on <pre>.
// Converted to markdown, every line gains a blank line (splitting `\` continuations) and the fence
// loses its language, which hast-util-to-mdast reads only from <code>.

const classes = (node) => [].concat(node.properties?.className ?? []);
const isElement = (node, tag) => node?.type === "element" && (!tag || node.tagName === tag);
const text = (node) => (node.type === "text" ? node.value : (node.children ?? []).map(text).join(""));
const isTitle = (node) => isElement(node, "div") && classes(node).some((c) => c.startsWith("codeBlockTitle"));

/** Rewrites a Docusaurus <pre> to one text node with the language on <code>; false for another shape. */
function flattenPre(pre) {
  if (!isElement(pre, "pre") || !classes(pre).includes("prism-code")) return false;
  const code = pre.children.find((c) => isElement(c, "code"));
  const lines = code?.children.filter((c) => isElement(c));
  if (!lines?.length || !lines.every((l) => isElement(l, "div") && classes(l).includes("token-line"))) return false;
  const language = classes(pre).find((c) => c.startsWith("language-"));
  code.properties = language ? { className: [language] } : {};
  code.children = [{ type: "text", value: lines.map(text).join("\n") }];
  return true;
}

// A title naming a file is kept as a "File:" line; a snippet identifier (`connect_to_network`) is
// noise in markdown and dropped; any other title stays as text.
function titleReplacement(title) {
  const value = text(title).trim();
  if (/^[A-Za-z_][\w-]*$/.test(value)) return [];
  if (!/\s/.test(value) && (value.includes("/") || /\.[A-Za-z0-9]+$/.test(value))) {
    const code = { type: "element", tagName: "code", properties: {}, children: [{ type: "text", value }] };
    return [{ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value: "File: " }, code] }];
  }
  return [{ type: "element", tagName: "p", properties: {}, children: [{ type: "text", value }] }];
}

function rewriteBlock(block) {
  const content = block.children.find((c) => isElement(c, "div") && !isTitle(c));
  const pre = content?.children.find((c) => isElement(c, "pre"));
  if (!flattenPre(pre)) return;
  block.children = block.children.flatMap((c) => (isTitle(c) ? titleReplacement(c) : [c]));
}

/** Rehype plugin: makes Docusaurus code blocks convert to one fenced, language-tagged block each. */
function rehypeCodeBlocks() {
  const visit = (node) => {
    if (isElement(node, "div") && classes(node).includes("theme-code-block")) {
      rewriteBlock(node);
      return;
    }
    node.children?.forEach(visit);
  };
  return visit;
}

module.exports = rehypeCodeBlocks;
