#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file path in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const monorepoRoot = path.resolve(__dirname, '../..');
const targetDir = path.join(monorepoRoot, 'noir-projects/noir-contracts/target');
const outputDir = path.join(monorepoRoot, 'playground/public/contracts');

// Define artifacts to copy with their new simplified names
const artifacts = [
  {
    source: 'easy_private_voting_contract-EasyPrivateVoting.json',
    destination: 'EasyPrivateVoting.json'
  },
  {
    source: 'simple_token_playground-SimpleToken.json',
    destination: 'SimpleToken.json'
  }
];

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Copy artifacts
artifacts.forEach(artifact => {
  const sourcePath = path.join(targetDir, artifact.source);
  const destPath = path.join(outputDir, artifact.destination);

  try {
    if (fs.existsSync(sourcePath)) {
      const data = fs.readFileSync(sourcePath);
      fs.writeFileSync(destPath, data);
    } else {
      console.error(`❌ Source file not found: ${sourcePath}`);
    }
  } catch (error) {
    console.error(`❌ Error copying ${artifact.source}:`, error.message);
  }
});

console.log('Successfully copied contract artifacts.');
