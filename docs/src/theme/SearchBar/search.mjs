// Pure search helpers, shared by the search bar and scripts/check_search_index.mts.

const VERSIONED = ["developer", "network"];

/**
 * The `docusaurus_tag` values a search covers by default: the version being
 * read, in both versioned doc sets, plus every unversioned page. On a developer
 * or operator page that is the page's version; elsewhere the reader's preferred
 * developer version, else the latest. A doc set without that version falls
 * back to its own latest.
 *
 * @param {{
 *   active?: {pluginId: string, version: string},
 *   preferred?: string,
 *   versions: Record<"developer" | "network", {names: string[], latest: string}>,
 * }} context
 * @returns {string[]}
 */
export function contextTags({ active, preferred, versions }) {
  const read = VERSIONED.includes(active?.pluginId)
    ? active.version
    : (preferred ?? versions.developer.latest);
  return [
    "default",
    "docs-participate-current",
    "docs-root-current",
    ...VERSIONED.map(
      (id) => `docs-${id}-${versions[id].names.includes(read) ? read : versions[id].latest}`,
    ),
  ];
}
