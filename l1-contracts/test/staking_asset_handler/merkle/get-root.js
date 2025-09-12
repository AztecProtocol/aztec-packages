#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { AbiParameters } = require('ox');

try {
  const treeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tree.json'), 'utf8'));
  const tree = StandardMerkleTree.load(treeData);

  const encodedRoot = AbiParameters.encode(AbiParameters.from(["bytes32"]), [tree.root]);
  console.log(encodedRoot);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
