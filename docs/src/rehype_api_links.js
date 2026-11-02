// Docs pages link the Aztec.nr API reference as HTML. In the markdown twins those links point at the
// page's markdown sibling instead, which scripts/aztec_nr_api_markdown.mjs writes after the build.

// Targets that are not a reference page: left as written.
const NOT_A_PAGE = /\.(md|txt|js|css)$/;

function markdownTarget(href, prefixes) {
  const [, pathname, suffix] = href.match(/^([^?#]*)(.*)$/s);
  if (!prefixes.some((prefix) => pathname.startsWith(prefix)) || NOT_A_PAGE.test(pathname)) return href;
  if (pathname.endsWith("/")) return `${pathname}index.md${suffix}`;
  return `${pathname.replace(/\.html$/, "")}.md${suffix}`;
}

/**
 * Rehype plugin: rewrites root-relative links into the given reference folders (`/x.html`, `/x`,
 * `/dir/`) to their `.md` page. Other links are untouched.
 *
 * @param {{dirs?: string[]}} options folders under the site root, e.g. `aztec-nr-api/mainnet`
 */
function rehypeApiLinks({ dirs = [] } = {}) {
  const prefixes = dirs.map((dir) => `/${dir}/`);
  const visit = (node) => {
    if (node.type === "element" && node.tagName === "a" && typeof node.properties?.href === "string") {
      node.properties.href = markdownTarget(node.properties.href, prefixes);
    }
    node.children?.forEach(visit);
  };
  return visit;
}

module.exports = rehypeApiLinks;
