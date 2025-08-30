const fs = require('fs');
const path = require('path');
const { preprocessIncludeCode } = require('./include_code.js');

// Root directory for the docs
const DOCS_ROOT = path.join(__dirname, '../..');
const DOCS_DIR = path.join(DOCS_ROOT, 'docs');
const PROCESSED_DOCS_DIR = path.join(DOCS_ROOT, 'processed-docs');
const PROCESSED_DOCS_CACHE_DIR = path.join(DOCS_ROOT, 'processed-docs-cache');

// Ensure output directories exist
function ensureDirectories() {
  if (!fs.existsSync(PROCESSED_DOCS_DIR)) {
    fs.mkdirSync(PROCESSED_DOCS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROCESSED_DOCS_CACHE_DIR)) {
    fs.mkdirSync(PROCESSED_DOCS_CACHE_DIR, { recursive: true });
  }
}

// Recursively find all files to process
function findFiles(dir, extensions = ['.md', '.mdx', '.json']) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'build' && entry.name !== '.git') {
      files.push(...findFiles(fullPath, extensions));
    } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

// Process a single file
async function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Apply preprocessing
  const result = await preprocessIncludeCode(content, filePath, DOCS_ROOT);
  
  // Calculate relative path from docs dir
  const relativePath = path.relative(DOCS_DIR, filePath);
  const outputPath = path.join(PROCESSED_DOCS_DIR, relativePath);
  const cachePath = path.join(PROCESSED_DOCS_CACHE_DIR, relativePath);
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Ensure cache directory exists
  const cacheDir = path.dirname(cachePath);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  // Write to cache first (safety)
  fs.writeFileSync(cachePath, result.content, 'utf8');
  
  // Only write to output if content changed
  if (result.isUpdated || !fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== result.content) {
    fs.writeFileSync(outputPath, result.content, 'utf8');
    return { path: relativePath, updated: true };
  }
  
  return { path: relativePath, updated: false };
}

// Process all files
async function processAllFiles() {
  ensureDirectories();
  
  const files = findFiles(DOCS_DIR);
  const results = [];
  let processedCount = 0;
  
  console.log(`Found ${files.length} files to process...`);
  
  for (const file of files) {
    try {
      const result = await processFile(file);
      results.push(result);
      
      if (result.updated) {
        processedCount++;
        console.log(`✓ Processed: ${result.path}`);
      }
    } catch (error) {
      console.error(`✗ Error processing ${path.relative(DOCS_ROOT, file)}: ${error.message}`);
      throw error;
    }
  }
  
  console.log(`\nProcessed ${processedCount} files with changes.`);
  return results;
}

// Clean processed docs
function cleanProcessedDocs() {
  if (fs.existsSync(PROCESSED_DOCS_DIR)) {
    fs.rmSync(PROCESSED_DOCS_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(PROCESSED_DOCS_CACHE_DIR)) {
    fs.rmSync(PROCESSED_DOCS_CACHE_DIR, { recursive: true, force: true });
  }
  console.log('Cleaned processed docs directories');
}

module.exports = {
  processAllFiles,
  cleanProcessedDocs
};

// Run if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'clean') {
    cleanProcessedDocs();
  } else {
    processAllFiles().catch(error => {
      console.error('Error processing files:', error);
      process.exit(1);
    });
  }
}