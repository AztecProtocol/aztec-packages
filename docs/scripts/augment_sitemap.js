#!/usr/bin/env node
/**
 * Post-build script to add static API documentation URLs to the sitemap.
 *
 * Docusaurus only includes its managed routes in sitemap.xml. This script
 * appends entries for the auto-generated API docs in static/ that are
 * copied to build/ but not indexed by the sitemap plugin.
 */

const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "..", "build");
// Override with SITE_URL env var if the canonical URL ever changes.
// Kept in sync with `url` in docusaurus.config.js.
const SITE_URL = process.env.SITE_URL || "https://docs.aztec.network";

// Load version config to determine which version subdirectory to index.
let developerVersionConfig;
try {
  developerVersionConfig = require("../developer_version_config.json");
} catch {
  developerVersionConfig = null;
}

const defaultType = developerVersionConfig?.mainnet
  ? "mainnet"
  : developerVersionConfig?.testnet
    ? "testnet"
    : null;

if (!defaultType) {
  console.warn("Warning: No default version found — skipping sitemap augmentation");
  process.exit(0);
}

/**
 * Recursively find all files with a given extension.
 */
function findFiles(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const sitemapPath = path.join(BUILD_DIR, "sitemap.xml");

  if (!fs.existsSync(sitemapPath)) {
    console.error("Error: build/sitemap.xml not found. Run the build first.");
    process.exit(1);
  }

  let sitemap = fs.readFileSync(sitemapPath, "utf-8");

  // Aztec.nr API HTML files (skip raw markdown — those aren't browsable pages)
  const nrApiDir = path.join(BUILD_DIR, `aztec-nr-api/${defaultType}`);
  // Exclude Noir stdlib (duplicated at noir-lang.org), the all.html mega-index,
  // and per-constant global.*.html pages. Keeps the sitemap aligned with the
  // Typesense stop_urls list so both discovery paths surface the same content.
  const EXCLUDE_RE = new RegExp(
    `aztec-nr-api/${defaultType}/(std/|all\\.html$|.*/global\\.[^/]+\\.html$)`
  );
  const htmlFiles = findFiles(nrApiDir, ".html").filter(
    (f) => !EXCLUDE_RE.test(f.replace(/\\/g, "/"))
  );

  if (htmlFiles.length === 0) {
    console.log("No static API docs found to add to sitemap");
    return;
  }

  // Build XML entries
  const entries = htmlFiles
    .map((file) => {
      const relativePath = path.relative(BUILD_DIR, file).replace(/\\/g, "/");
      return `<url><loc>${SITE_URL}/${relativePath}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`;
    })
    .join("");

  // Insert before closing </urlset>
  if (!sitemap.includes("</urlset>")) {
    console.error("Error: build/sitemap.xml missing </urlset> closing tag — aborting.");
    process.exit(1);
  }
  sitemap = sitemap.replace("</urlset>", entries + "</urlset>");

  fs.writeFileSync(sitemapPath, sitemap);
  console.log(`Added ${htmlFiles.length} Aztec.nr API doc URLs to sitemap.xml`);
}

main();
