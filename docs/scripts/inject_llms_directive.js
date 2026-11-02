#!/usr/bin/env node
/**
 * Post-build script to inject an llms.txt discovery directive into every built
 * HTML page.
 *
 * Agents that fetch the HTML version of a page have no built-in way to discover
 * that a documentation index exists at /llms.txt. The Agent-Friendly
 * Documentation spec (afdocs.dev) satisfies this with a visually-hidden element
 * near the top of the page body that links to llms.txt.
 *
 * This injects that element immediately after the opening <body> tag, so it
 * lands before the navbar (Docusaurus pages) or sidebar (static nargo-generated
 * API pages under build/aztec-nr-api/). On Docusaurus pages it sits before the
 * React root (<div id="__docusaurus">), so React never reconciles it and there
 * is no hydration mismatch.
 *
 * The injection is idempotent: pages already carrying the marker are skipped.
 */

const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "..", "build");

const MARKER = "data-llms-txt-directive";

// Visually-hidden via the standard clip-rect pattern so the directive is in the
// DOM body for agents but invisible to human readers.
const DIRECTIVE =
  `<div ${MARKER} style="position:absolute;width:1px;height:1px;padding:0;` +
  `margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;">` +
  `For the complete documentation index, see ` +
  `<a href="/llms.txt" tabindex="-1">llms.txt</a>.</div>`;

const BODY_TAG = /<body[^>]*>/i;

// An Aztec.nr API page with a markdown sibling (aztec_nr_api_markdown.mjs) names it the way the
// theme names a docs page's twin.
const API_DIR = path.join(BUILD_DIR, "aztec-nr-api");
const ALTERNATE = 'rel="alternate" type="text/markdown"';

function withMarkdownAlternate(html, file) {
  const twin = file.replace(/\.html$/, ".md");
  if (!file.startsWith(API_DIR + path.sep) || !fs.existsSync(twin) || html.includes(ALTERNATE)) return html;
  const href = `/${path.relative(BUILD_DIR, twin).split(path.sep).join("/")}`;
  return html.replace(/<\/head>/i, `<link ${ALTERNATE} href="${href}" title="Markdown">\n</head>`);
}

function* walkHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkHtml(full);
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      yield full;
    }
  }
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
  let noBody = 0;

  for (const file of walkHtml(BUILD_DIR)) {
    const original = fs.readFileSync(file, "utf-8");
    let html = withMarkdownAlternate(original, file);
    const match = html.match(BODY_TAG);

    if (html.includes(MARKER)) {
      skipped++;
    } else if (!match) {
      noBody++;
    } else {
      const insertAt = match.index + match[0].length;
      html = html.slice(0, insertAt) + DIRECTIVE + html.slice(insertAt);
      injected++;
    }
    if (html !== original) fs.writeFileSync(file, html);
  }

  console.log(
    `Injected llms.txt directive into ${injected} page(s) ` +
      `(${skipped} already had it, ${noBody} had no <body>).`,
  );
}

main();
