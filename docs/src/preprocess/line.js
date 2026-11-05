// A dev line is a directory docs/lines/<name>/ with its own aztec-node pin, pages and examples,
// following aztec-node's <name> branch. Everything else under docs/ is main's or shared.
const fs = require("fs");
const path = require("path");

const LINE_PATH = /^docs\/lines\/(v(\d+))\//;
const LINE_NAME = /^v\d+$/;

/**
 * The line a file belongs to, from its path.
 *
 * @param {string} filePath absolute, or relative to `rootDir`
 * @param {string | undefined} rootDir the repository root
 * @returns {{name: string, major: number, root: string} | null} null for main's and shared files
 */
function lineOf(filePath, rootDir) {
  if (!rootDir) return null;
  const rel = path.relative(rootDir, path.resolve(rootDir, filePath)).split(path.sep).join("/");
  const m = LINE_PATH.exec(rel);
  return m ? { name: m[1], major: Number(m[2]), root: path.join(rootDir, "docs", "lines", m[1]) } : null;
}

/** The lines, as scripts/aztec_node.mts finds them: docs/lines/v<major>/ directories holding a pin. */
function lineNames(rootDir) {
  const dir = path.join(rootDir, "docs", "lines");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((l) => LINE_NAME.test(l) && fs.existsSync(path.join(dir, l, "aztec-node.json"))).sort();
}

/** The aztec-node pin a page quotes: its line's, else docs/aztec-node.json. */
function readPin(rootDir, line) {
  const dir = line ? line.root : path.join(rootDir, "docs");
  return JSON.parse(fs.readFileSync(path.join(dir, "aztec-node.json"), "utf8"));
}

// Absolute links into the dev docs, which the line's own instances serve at /<base>-<line>/.
const DOCS_LINK = /(\]\(|href=["'])\/(developers|operate)\//g;

/** `content` with its links into the dev docs moved onto `line`'s instances. */
const lineLinks = (content, line) => content.replace(DOCS_LINK, (_, lead, base) => `${lead}/${base}-${line.name}/`);

module.exports = { lineLinks, lineNames, lineOf, readPin };
