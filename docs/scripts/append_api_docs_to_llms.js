#!/usr/bin/env node
/**
 * Post-build script to append static API documentation to llms.txt files.
 *
 * This script:
 * 1. Finds HTML files in static/aztec-nr-api/
 * 2. Converts them to markdown-like text
 * 3. Appends the content to build/llms-full.txt
 * 4. Adds links to build/llms.txt
 */

const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "..", "build");
const STATIC_DIR = path.join(__dirname, "..", "static");

// Load version config (source of truth for type→version mapping)
let developerVersionConfig;
try {
  developerVersionConfig = require("../developer_version_config.json");
} catch {
  // Fallback to legacy array-based detection
  developerVersionConfig = null;
}
const developerVersions = require("../developer_versions.json");

// Determine the default (highest-priority) API docs version to append.
// Only include one set to avoid bloating llms.txt. Priority: mainnet > testnet.
const defaultType = developerVersionConfig?.mainnet
  ? "mainnet"
  : developerVersionConfig?.testnet
    ? "testnet"
    : null;
const defaultVersion = defaultType
  ? developerVersionConfig[defaultType]
  : developerVersions[0] || null;

const API_DIRS = [];
if (
  defaultType &&
  fs.existsSync(path.join(STATIC_DIR, `aztec-nr-api/${defaultType}`))
) {
  API_DIRS.push({
    name: "Aztec.nr API Reference",
    dir: `aztec-nr-api/${defaultType}`,
    description: `Auto-generated API documentation for Aztec.nr (${defaultVersion})`,
    format: "html",
  });
} else if (!defaultType) {
  console.warn("Warning: No default version found for API docs");
}
if (
  defaultType &&
  fs.existsSync(path.join(STATIC_DIR, `typescript-api/${defaultType}`))
) {
  API_DIRS.push({
    name: "TypeScript API Reference",
    dir: `typescript-api/${defaultType}`,
    description: `Auto-generated TypeScript API documentation for Aztec packages (${defaultVersion})`,
    format: "markdown",
  });
}

/**
 * Extract text content from HTML, stripping tags and normalizing whitespace.
 * Only extracts content from <main> element to avoid redundant navigation.
 */
function htmlToText(html) {
  // Extract only the <main> content to avoid sidebar/navigation redundancy
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const content = mainMatch ? mainMatch[1] : html;

  return (
    content
      // Remove the breadcrumb div (first div with navigation links)
      .replace(/<div><a[^>]*>aztec-nr<\/a>[\s\S]*?<\/div>/i, "")
      // Remove script and style elements entirely
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, "")
      // Convert headers to markdown
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
      // Convert code blocks
      .replace(
        /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
        "\n```\n$1\n```\n",
      )
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      // Convert links - extract href and text
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
      // Convert lists
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
      // Convert paragraphs
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
      // Convert line breaks
      .replace(/<br\s*\/?>/gi, "\n")
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, "")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Normalize whitespace
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

/**
 * Recursively find all files with a given extension in a directory.
 */
function findFiles(dir, ext, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, ext, files);
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Recursively find all HTML files in a directory.
 */
function findHtmlFiles(dir) {
  return findFiles(dir, ".html");
}

/**
 * Recursively find every module index.html in a directory. A "module" is a
 * subdirectory that contains an `index.html` (the rustdoc convention used by
 * the nargo-generated API site).
 */
function findModuleIndexes(dir) {
  return findFiles(dir, "index.html");
}

/**
 * Extract the first paragraph from the rustdoc `<div class="comments">` block.
 * Returns "" if the module has no docstring.
 *
 * The HTML pattern produced by nargo doc is roughly:
 *   <main>
 *     <h1>Module <span ...>foo</span></h1>
 *     <div class="comments">
 *       <p>First paragraph - the summary sentence.</p>
 *       <p>Second paragraph - more detail.</p>
 *       ...
 *     </div>
 */
function extractModuleSummary(htmlPath) {
  let html;
  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    return "";
  }
  const commentsMatch = html.match(/<div class="comments">([\s\S]*?)<\/div>/);
  if (!commentsMatch) return "";
  const firstP = commentsMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/);
  if (!firstP) return "";
  return firstP[1]
    .replace(/<[^>]+>/g, "") // strip inline tags (a, code, em, ...)
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the list of structs, traits, and functions declared on a module
 * page. Returns an object like { Structs: ["Foo", "Bar"], Traits: ["Baz"] }.
 *
 * Nargo doc emits each section as:
 *   <h2 id="structs">Structs</h2><ul class="item-list">
 *     <li><div class="item-name"><a ...>Name</a></div><div class="item-description">...</div></li>
 *     ...
 *   </ul>
 *
 * Including item names in llms.txt is what makes individual types like
 * SingleUseClaim grep-able by an agent. Descriptions are dropped to keep the
 * file compact — the module entry already has its own description.
 */
function extractModuleItems(htmlPath) {
  let html;
  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    return {};
  }

  const result = {};
  const sectionRegex =
    /<h2 id="(structs|traits|functions)">[^<]*<\/h2>\s*<ul class="item-list">([\s\S]*?)<\/ul>/g;
  let match;
  while ((match = sectionRegex.exec(html)) !== null) {
    const kind = match[1];
    const body = match[2];
    const names = [];
    const itemRegex = /<div class="item-name">[\s\S]*?>([A-Za-z_][\w]*)<\/a>/g;
    let item;
    while ((item = itemRegex.exec(body)) !== null) {
      names.push(item[1]);
    }
    if (names.length > 0) {
      // Capitalize kind: structs → Structs
      const label = kind.charAt(0).toUpperCase() + kind.slice(1);
      result[label] = names;
    }
  }
  return result;
}

/**
 * Convert a module index path on disk to its rustdoc path notation.
 * E.g. .../noir_aztec/state_vars/balance_set/index.html → noir_aztec::state_vars::balance_set
 */
function moduleNameFromPath(filePath, apiRoot) {
  const rel = path.relative(apiRoot, filePath);
  const dir = path.dirname(rel);
  if (dir === "" || dir === ".") return "aztec-nr (all crates)";
  return dir.split(path.sep).join("::");
}

/**
 * Crates to skip in the module TOC. `std` and `serde` are noir stdlib / generic
 * helpers documented elsewhere. `protocol_types` is included but capped at
 * MAX_DEPTH below — it has ~120 deeply-nested kernel-internal entries that
 * application developers rarely need.
 */
const SKIPPED_CRATES = new Set(["std", "serde"]);

/**
 * Per-crate max depth in the module TOC. Crates listed here only contribute
 * modules up to this depth (relative to the crate root). Crates not listed
 * have no depth limit.
 */
const CRATE_MAX_DEPTH = {
  protocol_types: 2,
};

/**
 * Recursively find all markdown files in a directory.
 * Note: `llm-summary.txt` is naturally excluded since it does not end in `.md`.
 */
function findMarkdownFiles(dir) {
  return findFiles(dir, ".md");
}

/**
 * Get the relative URL path for a file.
 */
function getUrlPath(filePath, staticDir) {
  const relativePath = path.relative(staticDir, filePath);
  // Convert to URL path format
  return "/" + relativePath.replace(/\\/g, "/");
}

/**
 * Sort files by importance - Aztec-specific content first, std library last.
 */
function sortByImportance(files) {
  const priority = {
    noir_aztec: 0,
    protocol_types: 1,
    address_note: 2,
    balance_set: 2,
    field_note: 2,
    uint_note: 2,
    poseidon: 2,
    compressed_string: 2,
    sha256: 2,
    std: 3,
  };

  return files.sort((a, b) => {
    const getPriority = (filePath) => {
      for (const [dir, p] of Object.entries(priority)) {
        if (filePath.includes(`/${dir}/`)) return p;
      }
      return 2; // Default priority for unknown dirs
    };
    return getPriority(a) - getPriority(b);
  });
}

/**
 * Main function to append API docs to llms.txt files.
 */
function main() {
  const llmsTxtPath = path.join(BUILD_DIR, "llms.txt");
  const llmsFullTxtPath = path.join(BUILD_DIR, "llms-full.txt");

  // Check if build files exist
  if (!fs.existsSync(llmsTxtPath)) {
    console.error("Error: build/llms.txt not found. Run the build first.");
    process.exit(1);
  }

  let llmsTxtContent = fs.readFileSync(llmsTxtPath, "utf-8");
  let llmsFullTxtContent = fs.existsSync(llmsFullTxtPath)
    ? fs.readFileSync(llmsFullTxtPath, "utf-8")
    : "";

  let totalFiles = 0;
  let sectionsAdded = 0;
  let linksSection = "\n\n# API Reference Documentation\n\n";
  let fullContentSection = "\n\n---\n\n# API Reference Documentation\n\n";

  for (const apiDir of API_DIRS) {
    const dirPath = path.join(STATIC_DIR, apiDir.dir);

    if (!fs.existsSync(dirPath)) {
      console.log(`Skipping ${apiDir.name}: directory not found`);
      continue;
    }

    const isMarkdown = apiDir.format === "markdown";
    const files = isMarkdown
      ? findMarkdownFiles(dirPath).sort()
      : sortByImportance(findHtmlFiles(dirPath));
    const ext = isMarkdown ? ".md" : ".html";
    console.log(
      `Found ${files.length} ${isMarkdown ? "markdown" : "HTML"} files in ${apiDir.dir}`,
    );

    if (files.length === 0) {
      continue;
    }

    sectionsAdded++;

    // Add section header
    linksSection += `## ${apiDir.name}\n\n`;
    linksSection += `${apiDir.description}\n\n`;
    fullContentSection += `## ${apiDir.name}\n\n`;
    fullContentSection += `${apiDir.description}\n\n`;

    if (isMarkdown) {
      // For markdown API docs, add a link per file and include llm-summary.txt if present
      const summaryPath = path.join(dirPath, "llm-summary.txt");
      if (fs.existsSync(summaryPath)) {
        linksSection += fs.readFileSync(summaryPath, "utf-8") + "\n\n";
      }
      // Cap link list at 100 entries to bound llms.txt size as the API surface grows.
      for (const file of files.slice(0, 100)) {
        const urlPath = getUrlPath(file, STATIC_DIR);
        const fileName = path.basename(file, ext);
        linksSection += `- [${fileName}](${urlPath})\n`;
      }
      if (files.length > 100) {
        linksSection += `- ... and ${files.length - 100} more files\n`;
      }
    } else {
      // For HTML API docs, emit a module-index TOC. One entry per module
      // (every subdirectory containing an index.html), with the module's
      // first-paragraph docstring as description, plus the names of structs,
      // traits, and functions declared on that module page.
      //
      // The item names are what makes specific types (e.g. SingleUseClaim)
      // findable: an agent searching llms.txt for the name lands on the
      // owning module, then follows the link to the actual rustdoc page.
      const moduleIndexes = findModuleIndexes(dirPath).filter((f) => {
        const rel = path.relative(dirPath, f);
        const parts = rel.split(path.sep);
        if (parts.length === 0) return false;
        const crate = parts[0];
        if (SKIPPED_CRATES.has(crate)) return false;
        const maxDepth = CRATE_MAX_DEPTH[crate];
        if (maxDepth !== undefined) {
          // depth = number of directories between crate root and this module
          // (parts excludes the trailing index.html since we use path.sep)
          const depth = parts.length - 1; // -1 for index.html filename
          if (depth > maxDepth) return false;
        }
        return true;
      });

      moduleIndexes.sort();

      linksSection += `Module index. Each entry lists the module's exported structs, traits, and functions; follow the link to the rustdoc page for full signatures and docs.\n\n`;

      for (const file of moduleIndexes) {
        const urlPath = getUrlPath(file, STATIC_DIR);
        const moduleName = moduleNameFromPath(file, dirPath);
        const summary = extractModuleSummary(file);
        const items = extractModuleItems(file);

        let line = `- [${moduleName}](${urlPath})`;
        if (summary) line += `: ${summary}`;
        const itemParts = [];
        for (const kind of ["Structs", "Traits", "Functions"]) {
          if (items[kind]) itemParts.push(`${kind}: ${items[kind].join(", ")}`);
        }
        if (itemParts.length > 0) line += ` — ${itemParts.join("; ")}.`;
        linksSection += line + "\n";
      }

      console.log(
        `  Emitted ${moduleIndexes.length} module-index entries (from ${files.length} HTML files)`,
      );
    }

    linksSection += "\n";

    // Add full content for all files
    for (const file of files) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const text = isMarkdown ? raw.trim() : htmlToText(raw);

        if (text.length > 100) {
          // Only include if there's meaningful content
          const urlPath = getUrlPath(file, STATIC_DIR);
          fullContentSection += `### ${urlPath}\n\n`;
          fullContentSection += text + "\n\n---\n\n";
          totalFiles++;
        }
      } catch (err) {
        console.error(`Error processing ${file}: ${err.message}`);
      }
    }
  }

  if (sectionsAdded === 0) {
    console.log(
      "No API docs found on disk — leaving llms.txt and llms-full.txt unchanged",
    );
    return;
  }

  // Append to llms.txt
  fs.writeFileSync(llmsTxtPath, llmsTxtContent + linksSection);
  console.log(`Updated llms.txt with API reference links`);

  // Append to llms-full.txt
  fs.writeFileSync(llmsFullTxtPath, llmsFullTxtContent + fullContentSection);
  console.log(`Updated llms-full.txt with ${totalFiles} API reference files`);
}

main();
