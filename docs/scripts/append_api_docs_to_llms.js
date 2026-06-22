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

// Site URL used to build absolute links for the API reference sections. Read
// from docusaurus.config.js so it tracks the configured domain. Trailing slash
// stripped so it can be concatenated with leading-slash paths.
function loadSiteUrl() {
  try {
    const config = fs.readFileSync(
      path.join(__dirname, "..", "docusaurus.config.js"),
      "utf-8",
    );
    const match = config.match(/^\s*url:\s*["']([^"']+)["']/m);
    if (match) return match[1].replace(/\/$/, "");
  } catch {
    // fall through to default
  }
  return "https://docs.aztec.network";
}
const SITE_URL = loadSiteUrl();

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

// Floors for the rustdoc (HTML) scoped index. extractModuleSummary/
// extractModuleItems parse the nargo-generated HTML with regexes; if that HTML
// structure changes they silently return empty and the symbol index — the
// whole point of this file — degrades without failing the build. These floors
// turn that into a hard build failure. They are deliberately well below the
// current counts (~286 modules, ~1k item names) so normal API churn never trips
// them; only a wholesale extraction break does.
const MIN_HTML_MODULES = 50;
const MIN_HTML_ITEM_NAMES = 100;

/**
 * Recursively find all markdown files in a directory.
 * Note: `llm-summary.txt` is naturally excluded since it does not end in `.md`.
 */
function findMarkdownFiles(dir) {
  return findFiles(dir, ".md");
}

/**
 * Get the absolute URL for an API reference file. API links stay absolute; the
 * page links the llms-txt plugin emits are root-relative. Both resolve on the
 * deployed site.
 */
function getUrlPath(filePath, staticDir) {
  const relativePath = path.relative(staticDir, filePath);
  // Convert to URL path format
  return SITE_URL + "/" + relativePath.replace(/\\/g, "/");
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
 * Insert a link to llms-full.txt after the H1 title block.
 *
 * The llms.txt spec opens with a single H1, optionally followed by a blockquote
 * summary, before any other content. We insert the link after that block so it
 * is the first thing an agent reads while preserving the single-H1 structure.
 * Idempotent: a second pass over content that already has the link is a no-op.
 */
function insertFullTxtLink(content) {
  const link = `For the complete documentation as a single file, see [llms-full.txt](${SITE_URL}/llms-full.txt).`;
  // Match the exact link line, not a bare "/llms-full.txt" substring, so an
  // unrelated mention of that path in the generated content can't suppress
  // insertion. Keeps the function a no-op only on its own prior output.
  if (content.includes(link)) return content;

  const lines = content.split("\n");
  const h1Index = lines.findIndex((line) => /^# /.test(line));
  if (h1Index === -1) {
    // No H1 found; prepend rather than drop the link.
    return `${link}\n\n${content}`;
  }

  // Skip past the H1 and any immediately following blockquote summary lines.
  let insertAt = h1Index + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === "") insertAt++;
  while (insertAt < lines.length && /^>/.test(lines[insertAt])) insertAt++;

  lines.splice(insertAt, 0, "", link, "");
  // Collapse any runs of blank lines the insertion may have created.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Insert a one-line steering pointer to the AI Tooling guide, right after the
 * llms-full.txt link. An agent reading llms.txt sees it before the link map, so
 * it learns the recommended CLAUDE.md/AGENTS.md setup (use the `aztec` CLI, not
 * `nargo` or `bb`; default to Poseidon2; error handling) before generating
 * code. We link the page rather than inline the guidelines so there is a single
 * source of truth that cannot drift. Uses the stable (unversioned) docs URL.
 * Idempotent via the unique opening sentinel. We can't key off the URL: the
 * Table of Contents already links `/developers/ai_tooling`, so a URL check would
 * always short-circuit and the pointer would never be inserted.
 */
function insertAiToolingPointer(content) {
  const sentinel = "**Setting up an AI agent?**";
  const url = `${SITE_URL}/developers/ai_tooling`;
  const pointer = `${sentinel} Read the [AI Tooling guide](${url}) first for recommended CLAUDE.md/AGENTS.md instructions and common-mistake guidance (use the \`aztec\` CLI, not \`nargo\` or \`bb\` directly).`;
  if (content.includes(sentinel)) return content;

  const lines = content.split("\n");
  // Prefer anchoring after the llms-full.txt link so the intro reads: H1,
  // blockquote, full-file link, then this pointer.
  let anchorIndex = lines.findIndex((line) => line.includes("/llms-full.txt"));
  if (anchorIndex === -1) {
    // Fall back to after the H1 (and optional blockquote) if the link is absent.
    const h1Index = lines.findIndex((line) => /^# /.test(line));
    if (h1Index === -1) return `${pointer}\n\n${content}`;
    anchorIndex = h1Index;
    while (
      anchorIndex + 1 < lines.length &&
      lines[anchorIndex + 1].trim() === ""
    )
      anchorIndex++;
    while (anchorIndex + 1 < lines.length && /^>/.test(lines[anchorIndex + 1]))
      anchorIndex++;
  }

  lines.splice(anchorIndex + 1, 0, "", pointer, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Truncate `content` at the earliest of the given sentinel strings, dropping it
 * and everything after. Returns the content unchanged when no sentinel is
 * present. Used to make the section appends below idempotent: a re-run strips
 * the sections a previous run added, then re-appends fresh ones, instead of
 * duplicating them. (`yarn build` always starts with `yarn clean`, so on the
 * normal path nothing is stripped; this only guards manual or repeated runs.)
 */
function stripFrom(content, ...sentinels) {
  let cut = -1;
  for (const sentinel of sentinels) {
    const i = content.indexOf(sentinel);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  return cut === -1 ? content : content.slice(0, cut);
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

  // Drop any sections a previous run of this script appended so re-running it
  // replaces rather than duplicates them (the top-of-file insertions below are
  // separately idempotent).
  llmsTxtContent = stripFrom(
    llmsTxtContent,
    "\n\n## API Reference\n\n",
    "\n\n## Optional\n\n",
  );
  llmsFullTxtContent = stripFrom(
    llmsFullTxtContent,
    "\n\n---\n\n## API Reference Documentation\n\n",
  );

  // Point readers at the single-file dump up front. It sits right after the H1
  // title (and its optional blockquote summary) so an agent sees it before any
  // section, but stays out of the H1 to keep a single top-level heading.
  llmsTxtContent = insertFullTxtLink(llmsTxtContent);
  // Then steer agents to the AI Tooling guide (setup + common-mistake guidance).
  llmsTxtContent = insertAiToolingPointer(llmsTxtContent);

  let totalFiles = 0;
  let sectionsAdded = 0;
  // Per the llms.txt spec there is a single H1 (the project title, emitted by
  // the llms-txt plugin). Everything we append is an H2 section. The
  // `## Optional` section has special meaning: its links may be skipped when a
  // shorter context is needed, so secondary community resources live there and
  // are ordered last. Community resources are independent of the generated API
  // docs, so they are always appended (see write logic below).
  let communitySection =
    "\n\n## Optional\n\n" +
    "- [awesome-aztec](https://github.com/AztecProtocol/awesome-aztec): Curated index of high-quality community resources, tools, libraries, and example projects for building on Aztec.\n";
  let fullContentSection = "\n\n---\n\n## API Reference Documentation\n\n";

  // Hub-and-spoke (the pattern used by Cloudflare/Next/Svelte): the root
  // llms.txt stays a lean navigational map and links to one scoped llms.txt per
  // API surface, which carries the full module/symbol index. Collected here for
  // the root "## API Reference" section.
  const apiReferenceLinks = [];

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
    fullContentSection += `## ${apiDir.name}\n\n`;
    fullContentSection += `${apiDir.description}\n\n`;

    // Build the standalone scoped index: its own single H1 + blockquote
    // summary, then the module/package body.
    let scopedDoc = `# ${apiDir.name}\n\n> ${apiDir.description}\n\n`;

    if (isMarkdown) {
      // Include the generated llm-summary.txt (package overview). It carries its
      // own heading hierarchy starting at H1; demote by one level so it nests
      // under this scoped file's H1 (which is the only top-level heading).
      const summaryPath = path.join(dirPath, "llm-summary.txt");
      if (fs.existsSync(summaryPath)) {
        const summary = fs
          .readFileSync(summaryPath, "utf-8")
          .replace(/^(#{1,5}) /gm, "#$1 ");
        scopedDoc += summary + "\n\n";
      }
      scopedDoc += "## Package reference files\n\n";
      for (const file of files) {
        const urlPath = getUrlPath(file, STATIC_DIR);
        const fileName = path.basename(file, ext);
        scopedDoc += `- [${fileName}](${urlPath})\n`;
      }
    } else {
      // Module-index TOC. One entry per module (every subdirectory with an
      // index.html), with its first-paragraph docstring as description, plus
      // the names of exported structs, traits, and functions. The item names
      // are what makes specific types (e.g. SingleUseClaim) findable: an agent
      // searching this index for the name lands on the owning module, then
      // follows the link to the rustdoc page.
      const moduleIndexes = findModuleIndexes(dirPath).filter((f) => {
        const rel = path.relative(dirPath, f);
        const parts = rel.split(path.sep);
        if (parts.length === 0) return false;
        const crate = parts[0];
        if (SKIPPED_CRATES.has(crate)) return false;
        const maxDepth = CRATE_MAX_DEPTH[crate];
        if (maxDepth !== undefined) {
          // parts has the form [crate_name, sub1, sub2, ..., "index.html"].
          // We want the path segment count (1 = crate root, 2 = first-level
          // submodule, ...) so subtract 1 for the trailing index.html.
          // maxDepth=2 keeps crate root + first-level submodules only.
          const depth = parts.length - 1;
          if (depth > maxDepth) return false;
        }
        return true;
      });

      moduleIndexes.sort();

      scopedDoc += `## Module index\n\nEach entry lists the module's exported structs, traits, and functions; follow the link to the rustdoc page for full signatures and docs.\n\n`;

      let itemNameCount = 0;
      for (const file of moduleIndexes) {
        const urlPath = getUrlPath(file, STATIC_DIR);
        const moduleName = moduleNameFromPath(file, dirPath);
        const summary = extractModuleSummary(file);
        const items = extractModuleItems(file);

        let line = `- [${moduleName}](${urlPath})`;
        if (summary) line += `: ${summary}`;
        const itemParts = [];
        for (const kind of ["Structs", "Traits", "Functions"]) {
          if (items[kind]) {
            itemNameCount += items[kind].length;
            itemParts.push(`${kind}: ${items[kind].join(", ")}`);
          }
        }
        if (itemParts.length > 0) line += ` — ${itemParts.join("; ")}.`;
        scopedDoc += line + "\n";
      }

      console.log(
        `  Emitted ${moduleIndexes.length} module-index entries (${itemNameCount} item names, from ${files.length} HTML files)`,
      );

      // Fail loud if extraction collapsed (e.g. nargo changed its HTML and the
      // regexes no longer match): a near-empty index would otherwise ship
      // silently and strand agents searching for symbols like SingleUseClaim.
      if (
        moduleIndexes.length < MIN_HTML_MODULES ||
        itemNameCount < MIN_HTML_ITEM_NAMES
      ) {
        console.error(
          `Error: ${apiDir.name} index looks degraded ` +
            `(${moduleIndexes.length} modules, ${itemNameCount} item names; ` +
            `expected >= ${MIN_HTML_MODULES} modules and >= ${MIN_HTML_ITEM_NAMES} item names). ` +
            `The rustdoc HTML structure likely changed — fix extractModuleSummary/extractModuleItems.`,
        );
        process.exit(1);
      }
    }

    // Write the scoped index alongside the API docs in the build output
    // (build/<apiDir.dir>/llms.txt, served at SITE_URL/<apiDir.dir>/llms.txt).
    const scopedPath = path.join(BUILD_DIR, apiDir.dir, "llms.txt");
    try {
      fs.mkdirSync(path.dirname(scopedPath), { recursive: true });
      if (fs.existsSync(scopedPath)) {
        console.warn(
          `  Warning: overwriting existing ${path.relative(BUILD_DIR, scopedPath)}`,
        );
      }
      fs.writeFileSync(scopedPath, scopedDoc);
      console.log(
        `  Wrote scoped index ${path.relative(BUILD_DIR, scopedPath)}`,
      );
      apiReferenceLinks.push(
        `- [${apiDir.name}](${SITE_URL}/${apiDir.dir}/llms.txt): ${apiDir.description}`,
      );
    } catch (err) {
      console.error(
        `  Failed to write scoped index for ${apiDir.name}: ${err.message}`,
      );
    }

    // Add full content for all files (llms-full.txt)
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

  // Root "## API Reference" section: a steering sentence plus one link per
  // scoped index. Detailed module/symbol listings live in the scoped files.
  let apiSection = "";
  if (apiReferenceLinks.length > 0) {
    apiSection =
      "\n\n## API Reference\n\n" +
      "Use these when writing or debugging Aztec contracts (Aztec.nr) or TypeScript apps; the guides above are better for concepts and how-tos. Each link is a complete, scoped API index.\n\n" +
      apiReferenceLinks.join("\n") +
      "\n";
  }

  if (sectionsAdded === 0) {
    // No API docs on disk: still append the Optional section so the
    // awesome-aztec link survives builds that skip API generation.
    fs.writeFileSync(llmsTxtPath, llmsTxtContent + communitySection);
    console.log("No API docs found on disk — appended Optional only");
    return;
  }

  // Append the API reference index, then the Optional (community) section last
  // so it can be dropped when a shorter context is needed.
  fs.writeFileSync(llmsTxtPath, llmsTxtContent + apiSection + communitySection);
  console.log(
    `Updated llms.txt with scoped API reference links and optional resources`,
  );

  // Append to llms-full.txt
  fs.writeFileSync(llmsFullTxtPath, llmsFullTxtContent + fullContentSection);
  console.log(`Updated llms-full.txt with ${totalFiles} API reference files`);
}

main();
