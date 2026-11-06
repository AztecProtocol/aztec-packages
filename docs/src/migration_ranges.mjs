// Selects a version range of the migration notes from their section index (written beside each
// markdown twin by scripts/index_migration_notes.mjs). No Node or DOM APIs: the Netlify edge
// function (Deno) and the page's copy panel import this file as it is.

const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/i;
const UNRELEASED = /^(tbd|unreleased)$/i;

/**
 * A version as the page and its query parameters write it: semver with an optional `v`, a two-part
 * `X.Y` read as `X.Y.0`, or `TBD` / `unreleased` for the notes not yet released, which sort above
 * every version. Build metadata (`+…`) is refused: no Aztec version carries it.
 *
 * @param {unknown} text
 * @returns {{text: string, unreleased: boolean, core: number[], pre: string[]} | null}
 */
export function parseVersion(text) {
  if (typeof text !== "string" || text.length > 64) return null;
  if (UNRELEASED.test(text)) return { text: "unreleased", unreleased: true, core: [], pre: [] };
  const m = VERSION.exec(text);
  const pre = m?.[4] ? m[4].split(".") : [];
  if (!m || pre.some((id) => /^0\d+$/.test(id))) return null;
  return {
    text: text.replace(/^v/i, ""),
    unreleased: false,
    core: [m[1], m[2], m[3] ?? "0"].map(Number),
    pre,
  };
}

const isNumeric = (id) => /^\d+$/.test(id);

/** Semver precedence of two parsed versions: negative, zero or positive. */
export function compareVersions(a, b) {
  if (a.unreleased || b.unreleased) return Number(a.unreleased) - Number(b.unreleased);
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] - b.core[i];
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === y) continue;
    if (isNumeric(x) && isNumeric(y)) return Number(x) - Number(y);
    if (isNumeric(x) !== isNumeric(y)) return isNumeric(x) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return a.pre.length - b.pre.length;
}

/**
 * The sections a project crosses when it upgrades from `from` to `to`: every version v with
 * from < v ≤ to, oldest first. `to` defaults to the newest released section, so `TBD` is included
 * only when `to` is `unreleased`. Either end may be a version the page has no heading for.
 *
 * @param {{version: string, markdown: string}[]} sections the index, newest first
 * @param {{from?: string | null, to?: string | null}} query
 * @returns {{from: string, to: string, included: {version: string, markdown: string}[]}}
 * @throws {RangeError} a message fit to show the requester
 */
export function selectRange(sections, { from, to } = {}) {
  if (!from) throw new RangeError("from is required");
  const start = parseVersion(from);
  if (!start) throw new RangeError("from is not a version");
  const newest = sections.find((s) => !parseVersion(s.version).unreleased);
  const end = to ? parseVersion(to) : newest && parseVersion(newest.version);
  if (!end) throw new RangeError(to ? "to is not a version" : "this page has no released version");
  if (compareVersions(start, end) > 0) throw new RangeError(`from (${start.text}) is newer than to (${end.text})`);
  const included = sections
    .filter((s) => {
      const v = parseVersion(s.version);
      return compareVersions(v, start) > 0 && compareVersions(v, end) <= 0;
    })
    .reverse();
  return { from: start.text, to: end.text, included };
}

/**
 * The range as one markdown document. Its header names the versions it holds, so a reader can tell
 * a filtered response from the full page.
 *
 * @param {ReturnType<typeof selectRange>} selection
 * @param {string} sourceUrl the page the notes come from
 */
export function renderRange({ from, to, included }, sourceUrl) {
  return [
    `# Aztec migration notes: ${from} to ${to}`,
    `Source: ${sourceUrl}`,
    `Included versions: ${included.map((s) => s.version).join(", ") || "none"}`,
    "",
    ...included.map((s) => s.markdown.trimEnd() + "\n"),
  ].join("\n");
}
