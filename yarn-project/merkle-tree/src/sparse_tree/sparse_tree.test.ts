import { default as levelup } from 'levelup';
import { Hasher } from '../hasher.js';
import { merkleTreeTestSuite } from '../test/test_suite.js';
import { SparseMerkleTree } from './sparse_tree.js';
import { standardBasedTreeTestSuite } from '../test/standard_based_test_suite.js';
import { createMemDown } from '../test/utils.js';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { Pedersen } from '../pedersen.js';

const createDb = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string, depth: number) => {
  return await SparseMerkleTree.new(levelUp, hasher, name, depth);
};

const createFromName = async (levelUp: levelup.LevelUp, hasher: Hasher, name: string) => {
  return await SparseMerkleTree.fromName(levelUp, hasher, name);
};

merkleTreeTestSuite('SparseMerkleTree', createDb, createFromName, false);
standardBasedTreeTestSuite('SparseMerkleTree', createDb, false);

describe('SparseMerkleTreeSpecific', () => {
  let wasm: BarretenbergWasm;
  let pedersen: Pedersen;

  beforeEach(async () => {
    wasm = await BarretenbergWasm.get();
    pedersen = new Pedersen(wasm);
  });

  it('throws when calling `appendLeaves`', async () => {
    const db = levelup(createMemDown());
    const tree = await createDb(db, pedersen, 'test', 32);
    expect(() => tree.appendLeaves([])).toThrow();
  });
});
