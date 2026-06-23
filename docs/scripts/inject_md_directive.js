#!/usr/bin/env node
/**
 * Post-build script to add an llms.txt discovery directive to every generated
 * per-page markdown file.
 *
 * Agents that fetch the markdown version of a page benefit from a pointer back
 * to the documentation index. The Agent-Friendly Documentation spec
 * (afdocs.dev) satisfies this with a blockquote near the top of each markdown
 * page:
 *
 *   > For the complete documentation index, see [llms.txt](/llms.txt)
 *
 * The SignalWire llms-txt plugin writes a .md sibling for every route into the
 * build output but does not add this pointer, so we inject it here.
 *
 * Scope: the per-page markdown emitted by the plugin. The aggregate index files
 * (llms.txt / llms-full.txt) are .txt and never matched. The auto-generated API
 * reference markdown under typescript-api/ is left untouched — it is reference
 * material surfaced through the API sections of llms.txt, not a doc page.
 *
 * Idempotent: pages already carrying the directive line are skipped.
 */

const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "..", "build");

const DIRECTIVE =
  "> For the complete documentation index, see [llms.txt](/llms.txt)";

// Reference markdown that is not a documentation page.
const SKIP_DIRS = new Set(["typescript-api", "aztec-nr-api"]);

function* walkMarkdown(dir, rootRelative = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (rootRelative === "" && SKIP_DIRS.has(entry.name)) continue;
      yield* walkMarkdown(
        path.join(dir, entry.name),
        path.join(rootRelative, entry.name),
      );
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield path.join(dir, entry.name);
    }
  }
}

/**
 * Insert the directive after a leading YAML frontmatter block if present, so we
 * never break frontmatter parsing; otherwise prepend it to the top of the file.
 */
function withDirective(content) {
  const block = `${DIRECTIVE}\n\n`;
  const frontMatter = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (frontMatter) {
    const end = frontMatter[0].length;
    return content.slice(0, end) + "\n" + block + content.slice(end);
  }
  return block + content;
}

function main() {
  if (!fs.existsSync(BUILD_DIR)) {
    console.error(
      `Error: ${BUILD_DIR} not found. Run the build before this script.`,
    );
    process.exit(1);
  }

  let injected = 0;
  let skipped = 0;

  for (const file of walkMarkdown(BUILD_DIR)) {
    const content = fs.readFileSync(file, "utf-8");
    if (content.includes(DIRECTIVE)) {
      skipped++;
      continue;
    }
    fs.writeFileSync(file, withDirective(content));
    injected++;
  }

  console.log(
    `Injected llms.txt directive into ${injected} markdown page(s) ` +
      `(${skipped} already had it).`,
  );
}

main();
