import { default as levelup } from 'levelup';
import { Hasher } from '../hasher.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { treeTestSuite } from '../test/test_suite.js';
import { StandardTree } from './standard_tree.js';

const createDb = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string, depth: number) => {
  return await StandardTree.new<StandardTree>(StandardTree, levelUp, hasher, name, depth);
};

const createFromName = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string) => {
  return await StandardTree.fromName<StandardTree>(StandardTree, levelUp, hasher, name);
};

treeTestSuite('StandardTree', createDb, createFromName);
standardBasedTreeTestSuite('StandardTree', createDb);
