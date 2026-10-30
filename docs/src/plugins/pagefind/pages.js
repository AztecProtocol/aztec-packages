// Which built pages the search index holds, and the markup Pagefind reads from
// each. The stamping happens in memory; the served HTML is never rewritten.

// Navigation repeated on every docs page, which would otherwise match queries.
const EXCLUDE_SELECTORS = [
  "nav",
  ".pagination-nav",
  ".theme-doc-breadcrumbs",
  ".theme-doc-footer",
  ".theme-doc-toc-mobile",
  ".theme-doc-version-badge",
  ".theme-doc-version-banner",
  ".theme-edit-this-page",
];

// Ranks reference pages below the guides that use the same terms.
const API_WEIGHT = "0.5";

const metaContent = (html, name) =>
  html.match(new RegExp(`\\sname=["']?${name}["']?\\s+content=["']?([^"'\\s>]+)`))?.[1];

/**
 * Decides whether a built page is indexed and under which `docusaurus_tag`.
 * Docs pages carry Docusaurus's own tag; Aztec.nr API pages get `default`,
 * which every search context includes.
 *
 * @param {string} rel path relative to the build directory, `/`-separated
 * @param {string} html the page as built
 * @param {string[]} apiDirs the API trees to index, e.g. `aztec-nr-api/mainnet/`
 * @returns {{tag: string, body: "article" | "main", weight?: string} | null} null when not indexed
 */
function classifyPage(rel, html, apiDirs) {
  if (rel.startsWith("aztec-nr-api/")) {
    // Skips the bundled Noir std, the one-constant `global.*` pages and the
    // `all.html` item list, which would crowd the item pages out of results.
    if (
      !apiDirs.some((dir) => rel.startsWith(dir)) ||
      rel.includes("/std/") ||
      /\/(global\.[^/]+|all)\.html$/.test(rel)
    )
      return null;
    return { tag: "default", body: "main", weight: API_WEIGHT };
  }
  if (rel === "404.html" || /(^|\/)tags(\/|\.html$)/.test(rel)) return null;
  const tag = metaContent(html, "docusaurus_tag");
  return tag?.startsWith("docs-") ? { tag, body: "article" } : null;
}

/**
 * Marks the page's content element for Pagefind and attaches its tag filter.
 * API pages keep Pagefind's default title, their sidebar's crate name: Pagefind
 * ranks metadata, so their headings as titles would outrank the guides.
 *
 * @returns {string | null} the stamped HTML, or null when the page lacks its content element
 */
function stampPage(html, { tag, body, weight }) {
  const open = new RegExp(`<${body}(?=[\\s>])[^>]*>`).exec(html);
  if (!open) return null;
  const attrs = ` data-pagefind-body${weight ? ` data-pagefind-weight="${weight}"` : ""}`;
  return (
    html.slice(0, open.index) +
    `<${body}${attrs}${open[0].slice(body.length + 1)}` +
    `<span hidden data-pagefind-filter="docusaurus_tag:${tag}"></span>` +
    html.slice(open.index + open[0].length)
  );
}

/** The served URL of a build-relative HTML path; `trailingSlash: false` writes `/a/b` as `a/b.html`. */
const pageUrl = (rel) => `/${rel.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "")}`;

module.exports = { EXCLUDE_SELECTORS, classifyPage, pageUrl, stampPage };
