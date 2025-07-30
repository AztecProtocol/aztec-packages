#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { preprocessIncludeCode } = require('../src/preprocess/include_code.js');

// Root directory for the docs
const DOCS_ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(DOCS_ROOT, 'docs');

// Recursively find all markdown files
function findMarkdownFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'build') {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
      files.push(fullPath);
    }
  }

  return files;
}

// Process all markdown files
async function processAllFiles() {
  const files = findMarkdownFiles(DOCS_DIR);
  let processedCount = 0;

  console.log(`Found ${files.length} markdown files to process...`);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const result = await preprocessIncludeCode(content, file, DOCS_ROOT);

    if (result.isUpdated) {
      fs.writeFileSync(file, result.content, 'utf8');
      processedCount++;
      console.log(`✓ Processed: ${path.relative(DOCS_ROOT, file)}`);
    }
  }

  console.log(`\nProcessed ${processedCount} files with code inclusions.`);
}

// Run the preprocessing
processAllFiles().catch(error => {
  console.error('Error processing files:', error);
  process.exit(1);
});