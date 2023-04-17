import { default as levelup } from 'levelup';
import { Hasher } from '../hasher.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { merkleTreeTestSuite } from '../test/test_suite.js';
import { StandardMerkleTree } from './standard_tree.js';

const createDb = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string, depth: number) => {
  return await StandardMerkleTree.new<StandardMerkleTree>(levelUp, hasher, name, depth);
};

const createFromName = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string) => {
  return await StandardMerkleTree.fromName<StandardMerkleTree>(levelUp, hasher, name);
};

merkleTreeTestSuite('StandardMerkleTree', createDb, createFromName);
standardBasedTreeTestSuite('StandardMerkleTree', createDb);
