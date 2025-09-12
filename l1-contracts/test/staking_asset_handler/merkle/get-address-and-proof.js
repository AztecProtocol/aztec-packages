#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { StandardMerkleTree } = require('@openzeppelin/merkle-tree');
const { AbiParameters } = require('ox');

const index = parseInt(process.argv[2]);

if (isNaN(index)) {
  console.error('Please provide a valid index as argument');
  console.error('Usage: node get-address.js <index>');
  process.exit(1);
}

try {
  const treeData = JSON.parse(fs.readFileSync(path.join(__dirname, 'tree.json'), 'utf8'));
  const tree = StandardMerkleTree.load(treeData);

  const address = tree.at(index)[0];
  const proof = tree.getProof(index);

  const abiEncoded = AbiParameters.encode(AbiParameters.from(["address", "bytes32[]"]), [address, proof]);

  console.log(abiEncoded);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
