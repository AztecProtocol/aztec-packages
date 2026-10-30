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

/** Static Aztec.nr API pages, outside the router. */
export const API_PREFIX = "/aztec-nr-api/";

// The navbar's names for the doc sets.
const SECTIONS = { developer: "Build", network: "Run a Node", participate: "Participate" };

/**
 * How a result is labelled: its section, its version (null when unversioned;
 * the current docs are "dev", as in the version menu), up to two folders above
 * it, and for API pages a title, since the index titles them all by their crate.
 *
 * @param {string} url the result's path
 * @param {string | undefined} tag its `docusaurus_tag`
 * @param {string[]} versionPaths every docs version's base path, e.g. `/developers/v5.2.0`
 * @returns {{section: string, version: string | null, trail: string[], api: boolean, title?: string}}
 */
export function resultMeta(url, tag, versionPaths) {
  if (url.startsWith(API_PREFIX)) {
    // `/aztec-nr-api/<tree>/<crate>/<module>/.../<kind>.<Name>`, or a module's index.
    const segments = url.split("/").filter(Boolean).slice(2);
    const last = segments.pop();
    if (!last) return { section: "Aztec.nr API", version: null, trail: [], api: true };
    const [, kind, name] = /^([a-z_]+)\.(.+)$/.exec(last) ?? [null, "module", last];
    return { section: "Aztec.nr API", version: null, trail: segments, api: true, title: `${kind} ${name}` };
  }
  const [, pluginId, version] = /^docs-([a-z]+)-(.+)$/.exec(tag ?? "") ?? [];
  const root = versionPaths
    .filter((p) => url === p || url.startsWith(p.endsWith("/") ? p : `${p}/`))
    .reduce((longest, p) => (p.length > longest.length ? p : longest), "");
  const trail = url
    .slice(root.length)
    .split("/")
    .filter((s) => s && s !== "docs")
    .slice(0, -1)
    .slice(-2)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]+/g, " "));
  return {
    section: SECTIONS[pluginId] ?? "",
    version: VERSIONED.includes(pluginId) ? (version === "current" ? "dev" : version) : null,
    trail,
    api: false,
  };
}
