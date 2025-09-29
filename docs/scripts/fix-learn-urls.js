#!/usr/bin/env node

/**
 * Fix Learn Journey URLs
 *
 * PURPOSE:
 * This script fixes broken relative URLs in the Learning Journey documentation (/learn/).
 *
 * WHY IT EXISTS:
 * The Learning Journey reuses content from /developers/docs/ but reorganizes it into a different
 * directory structure. When files are copied to /learn/ with new numbering prefixes (like
 * "1_introduction.md", "2_setup.md"), their relative links break because they now point to
 * incorrect paths. This script automatically repairs those links by:
 *
 * 1. Finding the original source file in /developers/docs/ that corresponds to each learn file
 * 2. Determining where relative links in the source file point to
 * 3. Recalculating the correct relative paths from the new learn file location
 * 4. Updating the links in the learn files
 *
 * STRATEGY:
 * 1. Get the file name of the file with the broken link in /learn/
 * 2. Look for a file with the same name in /developers/docs/ (stripping number prefixes like "2_")
 * 3. Once the source file is found, save the path of the file
 * 4. For every relative link, determine where it points based on the source file's location
 * 5. Update the broken relative URL in the learn file to point to the correct location from its new path
 * 6. Validate that the fixed URL actually resolves to an existing file
 *
 * USAGE:
 * node fix-learn-urls.js [--dry-run] [--verbose|-v]
 */

const fs = require("fs");
const path = require("path");

// Configuration
const PROCESSED_DOCS_DIR = path.join(__dirname, "../processed-docs");
const LEARN_DIR = path.join(PROCESSED_DOCS_DIR, "learn");
const DOCS_ROOT = PROCESSED_DOCS_DIR;
const DEVELOPERS_DOCS_DIR = path.join(PROCESSED_DOCS_DIR, "developers/docs");
const DEVELOPERS_DIR = path.join(PROCESSED_DOCS_DIR, "developers");
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Fixing URLs in processed-docs/learn directory...`);
if (VERBOSE) {
  console.log("Verbose logging enabled");
}

/**
 * Recursively find all files in a directory
 */
function findAllFiles(dir, extensions = [".md", ".mdx"]) {
  const files = [];

  function traverse(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (
          entry.isFile() &&
          extensions.some((ext) => entry.name.endsWith(ext))
        ) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }

  traverse(dir);
  return files;
}

/**
 * Extract base filename without number prefix and extension
 * e.g., "2_how_to_define_storage.md" -> "how_to_define_storage"
 */
function getBaseFilename(filename) {
  // Remove extension
  const withoutExt = filename.replace(/\.(md|mdx)$/, "");

  // Remove number prefix (e.g., "2_" or "10_")
  const withoutPrefix = withoutExt.replace(/^\d+_/, "");

  return withoutPrefix;
}

/**
 * Find corresponding source file in developers/docs
 */
function findSourceFile(learnFilePath) {
  const filename = path.basename(learnFilePath);
  const baseFilename = getBaseFilename(filename);

  // Find all files in both developers/ and developers/docs/
  const developerFiles = [
    ...findAllFiles(DEVELOPERS_DOCS_DIR),
    ...findAllFiles(DEVELOPERS_DIR)
  ];

  // Look for a file with matching base name
  for (const devFile of developerFiles) {
    const devBasename = getBaseFilename(path.basename(devFile));
    if (devBasename === baseFilename) {
      return devFile;
    }
  }

  return null;
}

/**
 * Calculate relative path from one file to another
 */
function calculateRelativePath(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  const relativePath = path.relative(fromDir, toFile);

  // Convert to forward slashes for consistency
  return relativePath.replace(/\\/g, "/");
}

/**
 * Check if a file exists
 */
function fileExists(filePath) {
  try {
    return (
      fs.existsSync(filePath) ||
      fs.existsSync(filePath + ".md") ||
      fs.existsSync(filePath + ".mdx")
    );
  } catch {
    return false;
  }
}

/**
 * Get the actual file path (with extension if needed)
 */
function getActualFilePath(filePath) {
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  if (fs.existsSync(filePath + ".md")) {
    return filePath + ".md";
  }
  if (fs.existsSync(filePath + ".mdx")) {
    return filePath + ".mdx";
  }
  return null;
}

/**
 * Validate that a fixed URL resolves correctly
 */
function validateFixedUrl(fromFile, url) {
  // Skip external URLs, absolute paths, anchors, and special formats
  if (
    url.startsWith("http") ||
    url.startsWith("/") ||
    url.startsWith("#") ||
    url.startsWith("mailto:") ||
    url.startsWith("@site/")
  ) {
    return { valid: true, reason: "external or special URL" };
  }

  const currentDir = path.dirname(fromFile);
  const [urlPath, fragment] = url.split("#");
  const cleanUrl = urlPath.replace(/\.(md|mdx)$/, "");
  const resolvedPath = path.resolve(currentDir, cleanUrl);

  const actualPath = getActualFilePath(resolvedPath);

  if (!actualPath) {
    return { valid: false, reason: `file not found: ${resolvedPath}` };
  }

  // If there's a fragment, we could validate it exists in the target file
  // but that would require parsing markdown headers, which is complex
  // For now, just validate the file exists

  return { valid: true, reason: "resolves to: " + path.relative(DOCS_ROOT, actualPath) };
}

/**
 * Log verbose message
 */
function verboseLog(...args) {
  if (VERBOSE) {
    console.log("    [VERBOSE]", ...args);
  }
}

/**
 * Fix URLs in a learn file based on its corresponding source file
 */
function fixUrlsInFile(learnFilePath, sourceFilePath) {
  const content = fs.readFileSync(learnFilePath, "utf8");
  // Updated regex to handle nested brackets and backticks in link text
  // Matches [ followed by anything (including nested brackets in backticks), then ]( and the URL
  // The [\s\S] pattern matches any character including newlines
  const urlRegex = /\[((?:[^\[\]]|\[[^\]]*\])*?)\]\(([^)]+)\)/g;
  let modified = false;

  const fixedContent = content.replace(urlRegex, (match, linkText, url) => {
    // Skip external URLs, absolute paths, anchors, and special formats
    if (
      url.startsWith("http") ||
      url.startsWith("/") ||
      url.startsWith("#") ||
      url.startsWith("mailto:") ||
      url.startsWith("@site/")
    ) {
      verboseLog(`Skipping ${url} (external or special)`);
      return match;
    }

    // This is a relative URL - need to check if it's broken
    const currentDir = path.dirname(learnFilePath);
    const [urlPath, fragment] = url.split("#");
    const extensionMatch = urlPath.match(/\.(md|mdx)$/);
    const originalExtension = extensionMatch ? extensionMatch[0] : "";
    const cleanUrl = urlPath.replace(/\.(md|mdx)$/, "");
    const resolvedPath = path.resolve(currentDir, cleanUrl);

    // Check if the URL resolves correctly from the learn file location
    if (fileExists(resolvedPath)) {
      verboseLog(`URL already correct: ${url}`);
      return match; // URL is already correct
    }

    verboseLog(`URL broken: ${url}, attempting to fix...`);

    // URL is broken - try to fix it using the source file as reference
    const sourceDir = path.dirname(sourceFilePath);
    const sourceResolvedPath = path.resolve(sourceDir, cleanUrl);

    // Check if the URL would work from the source file location
    if (fileExists(sourceResolvedPath)) {
      // Calculate new relative path from learn file to the target
      const actualTargetPath = getActualFilePath(sourceResolvedPath);
      const newRelativePath = calculateRelativePath(
        learnFilePath,
        actualTargetPath
      );
      // Preserve the original extension (or derive from actual file if none)
      const targetExtension = originalExtension || path.extname(actualTargetPath);
      const newUrl = newRelativePath.replace(/\.(md|mdx)$/, "") + targetExtension + (fragment ? "#" + fragment : "");

      // Validate the fixed URL
      const validation = validateFixedUrl(learnFilePath, newUrl);
      if (!validation.valid) {
        console.warn(`  ⚠️  Fixed URL validation failed: ${url} -> ${newUrl}`);
        console.warn(`      Reason: ${validation.reason}`);
        return match;
      }

      console.log(`  Fixing: ${url} -> ${newUrl}`);
      if (VERBOSE) {
        console.log(`      Validation: ${validation.reason}`);
      }
      modified = true;
      return `[${linkText}](${newUrl})`;
    }

    // Try with extensions
    for (const ext of [".md", ".mdx"]) {
      const sourceResolvedPathWithExt = sourceResolvedPath + ext;
      if (fileExists(sourceResolvedPathWithExt)) {
        const actualTargetPath = getActualFilePath(sourceResolvedPathWithExt);
        const newRelativePath = calculateRelativePath(
          learnFilePath,
          actualTargetPath
        );
        // Preserve the original extension (or derive from actual file if none)
        const targetExtension = originalExtension || path.extname(actualTargetPath);
        const newUrl =
          newRelativePath.replace(/\.(md|mdx)$/, "") +
          targetExtension +
          (fragment ? "#" + fragment : "");

        // Validate the fixed URL
        const validation = validateFixedUrl(learnFilePath, newUrl);
        if (!validation.valid) {
          console.warn(`  ⚠️  Fixed URL validation failed: ${url} -> ${newUrl}`);
          console.warn(`      Reason: ${validation.reason}`);
          return match;
        }

        console.log(`  Fixing: ${url} -> ${newUrl}`);
        if (VERBOSE) {
          console.log(`      Validation: ${validation.reason}`);
        }
        modified = true;
        return `[${linkText}](${newUrl})`;
      }
    }

    console.warn(
      `  ⚠️  Could not resolve: ${url} in ${path.relative(
        DOCS_ROOT,
        learnFilePath
      )}`
    );
    return match;
  });

  return { content: fixedContent, modified };
}

/**
 * Process a single learn file
 */
function processLearnFile(learnFilePath) {
  // Step 1: Get the file name
  const filename = path.basename(learnFilePath);
  console.log(`\n📝 Processing: ${path.relative(DOCS_ROOT, learnFilePath)}`);

  // Step 2 & 3: Find corresponding source file in developers/docs
  const sourceFilePath = findSourceFile(learnFilePath);

  if (!sourceFilePath) {
    verboseLog(`No corresponding source file found for ${filename}`);
    console.log(`  ⚠️  No corresponding source file found for ${filename}`);
    return 0;
  }

  console.log(`  📍 Found source: ${path.relative(DOCS_ROOT, sourceFilePath)}`);

  // Step 4 & 5: Fix URLs based on source file location
  const result = fixUrlsInFile(learnFilePath, sourceFilePath);

  if (result.modified) {
    if (!DRY_RUN) {
      fs.writeFileSync(learnFilePath, result.content, "utf8");
      console.log(`  ✅ Updated`);
    } else {
      console.log(`  📋 Would update (dry run)`);
    }
    return 1;
  } else {
    verboseLog("No changes needed");
    console.log(`  ℹ️  No changes needed`);
    return 0;
  }
}

/**
 * Main execution
 */
function main() {
  if (!fs.existsSync(PROCESSED_DOCS_DIR)) {
    console.error(`Processed docs directory not found: ${PROCESSED_DOCS_DIR}`);
    console.error("Make sure to run preprocessing first.");
    process.exit(1);
  }

  if (!fs.existsSync(LEARN_DIR)) {
    console.error(`Learn directory not found: ${LEARN_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(DEVELOPERS_DOCS_DIR)) {
    console.error(
      `Developers docs directory not found: ${DEVELOPERS_DOCS_DIR}`
    );
    process.exit(1);
  }

  if (!fs.existsSync(DEVELOPERS_DIR)) {
    console.error(
      `Developers directory not found: ${DEVELOPERS_DIR}`
    );
    process.exit(1);
  }

  // Find all markdown files in learn directory
  const learnFiles = findAllFiles(LEARN_DIR);
  console.log(`Found ${learnFiles.length} markdown files in learn directory`);

  let processedCount = 0;
  let modifiedCount = 0;

  for (const learnFile of learnFiles) {
    processedCount++;
    const modified = processLearnFile(learnFile);
    modifiedCount += modified;
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Files processed: ${processedCount}`);
  console.log(`  Files modified: ${modifiedCount}`);

  if (DRY_RUN) {
    console.log(
      `\n💡 This was a dry run. Run without --dry-run to apply changes.`
    );
  }

  if (VERBOSE) {
    console.log("\nVerbose mode provided detailed logging above.");
  }

  console.log(`\n💡 Usage: node fix-learn-urls.js [--dry-run] [--verbose|-v]`);
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  getBaseFilename,
  findSourceFile,
  calculateRelativePath,
  fixUrlsInFile,
};
