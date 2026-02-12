#!/usr/bin/env node
/**
 * Post-build script to append static API documentation to llms.txt files.
 *
 * This script:
 * 1. Finds HTML files in static/aztec-nr-api/devnet
 * 2. Converts them to markdown-like text
 * 3. Appends the content to build/llms-full.txt
 * 4. Adds links to build/llms.txt
 */

const fs = require("fs");
const path = require("path");

const BUILD_DIR = path.join(__dirname, "..", "build");
const STATIC_DIR = path.join(__dirname, "..", "static");

// Load version from developer_versions.json (same as docusaurus.config.js)
const developerVersions = require("../developer_versions.json");

// Find devnet version dynamically (same logic as docusaurus.config.js)
const devnetVersion = developerVersions.find((v) => v.includes("devnet"));
if (!devnetVersion) {
  console.warn("Warning: No devnet version found in developer_versions.json");
}

// The API docs directories use "devnet" as the folder name
const API_DIRS = [
  {
    name: "Aztec.nr API Reference",
    dir: "aztec-nr-api/devnet",
    description: `Auto-generated API documentation for Aztec.nr (${devnetVersion || "devnet"})`,
  },
];

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
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
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
 * Recursively find all HTML files in a directory.
 */
function findHtmlFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findHtmlFiles(fullPath, files);
    } else if (entry.name.endsWith(".html")) {
      files.push(fullPath);
    }
  }

  return files;
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
  let linksSection = "\n\n# API Reference Documentation\n\n";
  let fullContentSection = "\n\n---\n\n# API Reference Documentation\n\n";

  for (const apiDir of API_DIRS) {
    const dirPath = path.join(STATIC_DIR, apiDir.dir);

    if (!fs.existsSync(dirPath)) {
      console.log(`Skipping ${apiDir.name}: directory not found`);
      continue;
    }

    const htmlFiles = sortByImportance(findHtmlFiles(dirPath));
    console.log(`Found ${htmlFiles.length} HTML files in ${apiDir.dir}`);

    if (htmlFiles.length === 0) {
      continue;
    }

    // Add section header
    linksSection += `## ${apiDir.name}\n\n`;
    linksSection += `${apiDir.description}\n\n`;
    fullContentSection += `## ${apiDir.name}\n\n`;
    fullContentSection += `${apiDir.description}\n\n`;

    // Process only index files for links to avoid overwhelming the llms.txt
    const indexFiles = htmlFiles.filter(
      (f) => f.endsWith("index.html") || f.includes("/fn.") || f.includes("/struct.") || f.includes("/trait.")
    );

    // Add links for key files
    for (const file of indexFiles.slice(0, 100)) {
      // Limit to 100 links per section
      const urlPath = getUrlPath(file, STATIC_DIR);
      const fileName = path.basename(file, ".html");
      linksSection += `- [${fileName}](${urlPath})\n`;
    }

    if (indexFiles.length > 100) {
      linksSection += `- ... and ${indexFiles.length - 100} more files\n`;
    }

    linksSection += "\n";

    // Add full content for all files
    for (const file of htmlFiles) {
      try {
        const html = fs.readFileSync(file, "utf-8");
        const text = htmlToText(html);

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

  // Append to llms.txt
  fs.writeFileSync(llmsTxtPath, llmsTxtContent + linksSection);
  console.log(`Updated llms.txt with API reference links`);

  // Append to llms-full.txt
  fs.writeFileSync(llmsFullTxtPath, llmsFullTxtContent + fullContentSection);
  console.log(`Updated llms-full.txt with ${totalFiles} API reference files`);
}

main();
