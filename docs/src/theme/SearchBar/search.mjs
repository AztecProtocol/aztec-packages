// scripts/check_search_index.mts imports this in Node: no browser or Docusaurus imports.

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

/**
 * Splits a Pagefind excerpt into text runs, flagging the highlighted ones.
 * Pagefind escapes only `<` and `>` in page text and adds `<mark>` and
 * `</mark>`, so those exact tokens are the only markup; all else is text.
 *
 * @param {string} excerpt
 * @returns {{text: string, mark: boolean}[]}
 */
export function excerptParts(excerpt) {
  const parts = [];
  let mark = false;
  for (const token of excerpt.split(/(<\/?mark>)/)) {
    if (token === "<mark>") mark = true;
    else if (token === "</mark>") mark = false;
    else if (token) parts.push({ text: token.replaceAll("&lt;", "<").replaceAll("&gt;", ">"), mark });
  }
  return parts;
}

/**
 * The URL when it is a same-origin path, else null. Browsers read `//host` and
 * `/\host` as another origin, and drop tabs and newlines before parsing.
 */
export const safeHref = (url) =>
  typeof url === "string" && /^\/(?![/\\])[^\u0000-\u001f\u007f]*$/.test(url) ? url : null;

/**
 * An Aztec.nr API page's title from its URL, e.g. `…/state_vars/struct.PrivateSet`
 * gives `struct noir_aztec::state_vars::PrivateSet`; null for other pages. The
 * index titles every API page by its crate name (see the pagefind plugin).
 */
export function apiTitle(url) {
  const path = /^\/aztec-nr-api\/[^/]+\/(.+?)\/?$/.exec(url)?.[1];
  if (!path) return null;
  const segments = path.split("/");
  const [, kind, name] = /^([a-z_]+)\.(.+)$/.exec(segments.at(-1)) ?? [];
  return kind ? `${kind} ${[...segments.slice(0, -1), name].join("::")}` : `module ${segments.join("::")}`;
}

const SECTIONS = { developer: "Developer docs", network: "Operator docs", participate: "Participate" };

/** A result's section label, from its `docusaurus_tag`; the current version is labelled "dev", as in the version menu. */
export function sectionLabel(tag) {
  if (tag === "default") return "Aztec.nr API";
  const [, pluginId, version] = /^docs-([a-z]+)-(.+)$/.exec(tag ?? "") ?? [];
  const section = SECTIONS[pluginId] ?? "";
  return VERSIONED.includes(pluginId) ? `${section} · ${version === "current" ? "dev" : version}` : section;
}
