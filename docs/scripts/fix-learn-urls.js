#!/usr/bin/env node

/* here is the strategy for fixing URLs

1. get the file name of the file with the broken link
2. look for a file with the same name in /developers/docs/. Some of the files that contain broken links may be prefixed with a number
underscore, so it may look like "2_how_to_define_storage.md" and the file to look for is called "how_to_define_storage"
3. once the source file is found, save the path of the file.
4. for every relative link, note the location, based on the current path of the file
5. update the broken realtive URL in the original file to a new realtive url. use the the path to the destination that was discovered.

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

console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Fixing URLs in processed-docs/learn directory...`);

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
 * Fix URLs in a learn file based on its corresponding source file
 */
function fixUrlsInFile(learnFilePath, sourceFilePath) {
  const content = fs.readFileSync(learnFilePath, "utf8");
  const urlRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
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
      return match;
    }

    // This is a relative URL - need to check if it's broken
    const currentDir = path.dirname(learnFilePath);
    const [urlPath, fragment] = url.split("#");
    const hasExtension = /\.(md|mdx)$/.test(urlPath);
    const cleanUrl = urlPath.replace(/\.(md|mdx)$/, "");
    const resolvedPath = path.resolve(currentDir, cleanUrl);

    // Check if the URL resolves correctly from the learn file location
    if (fileExists(resolvedPath)) {
      return match; // URL is already correct
    }

    // URL is broken - try to fix it using the source file as reference
    const sourceDir = path.dirname(sourceFilePath);
    const sourceResolvedPath = path.resolve(sourceDir, cleanUrl);

    // Check if the URL would work from the source file location
    if (fileExists(sourceResolvedPath)) {
      // Calculate new relative path from learn file to the target
      const newRelativePath = calculateRelativePath(
        learnFilePath,
        sourceResolvedPath
      );
      const newUrl = newRelativePath + (hasExtension ? ".md" : "") + (fragment ? "#" + fragment : "");

      console.log(`  Fixing: ${url} -> ${newUrl}`);
      modified = true;
      return `[${linkText}](${newUrl})`;
    }

    // Try with extensions
    for (const ext of [".md", ".mdx"]) {
      const sourceResolvedPathWithExt = sourceResolvedPath + ext;
      if (fileExists(sourceResolvedPathWithExt)) {
        const newRelativePath = calculateRelativePath(
          learnFilePath,
          sourceResolvedPathWithExt
        );
        const newUrl =
          newRelativePath.replace(/\.(md|mdx)$/, "") +
          (hasExtension ? ".md" : "") +
          (fragment ? "#" + fragment : "");

        console.log(`  Fixing: ${url} -> ${newUrl}`);
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
