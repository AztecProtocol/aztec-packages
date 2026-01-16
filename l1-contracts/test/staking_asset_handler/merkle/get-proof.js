#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { AbiParameters } = require('ox');

const index = parseInt(process.argv[2]);

if (isNaN(index)) {
  console.error('Please provide a valid index as argument');
  console.error('Usage: node get-proof.js <index>');
  process.exit(1);
}

try {
  const treeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tree.json'), 'utf8'));
  const tree = StandardMerkleTree.load(treeData);

  const entries = Array.from(tree.entries());

  if (index < 0 || index >= entries.length) {
    console.error(`Index out of range. Valid range: 0-${entries.length - 1}`);
    process.exit(1);
  }

  const proof = tree.getProof(index);
  const encodedProof = AbiParameters.encode(AbiParameters.from(["bytes32[]"]), [proof]);

  console.log(encodedProof);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
