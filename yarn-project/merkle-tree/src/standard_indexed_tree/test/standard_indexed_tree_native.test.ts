import { Fr } from '@aztec/foundation/fields';

import { MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, NullifierLeafPreimage } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { NativeTreesClient } from '../../native/native_client.js';
import { Pedersen } from '../../pedersen.js';
import { getWorldStateConfig } from '../../test/get_native_config.js';
import { INITIAL_LEAF } from '../../tree_base.js';
import { SiblingPath } from '@aztec/circuit-types';

const logger = createDebugLogger('aztec:standard_native_tree_test');

// const noopDeserializer: FromBuffer<Buffer> = {
//   fromBuffer: (buffer: Buffer) => buffer,
// };

// const createDb = async (store: AztecKVStore, hasher: Hasher, name: string, depth: number) => {
//   return await newTree(StandardTree, store, hasher, name, noopDeserializer, depth);
// };

// const createFromName = async (store: AztecKVStore, hasher: Hasher, name: string) => {
//   return await loadTree(StandardTree, store, hasher, name, noopDeserializer);
// };

// treeTestSuite('StandardTree', createDb, createFromName);
// standardBasedTreeTestSuite('StandardTree', createDb);

const TEST_TREE_DEPTH = 3;

const createNullifierTreeLeafHashInputs = (value: number, nextIndex: number, nextValue: number) => {
  return new NullifierLeafPreimage(new Fr(value), new Fr(nextValue), BigInt(nextIndex)).toHashInputs();
};

describe('Native Indexed Tree', () => {
  let nativeClient: NativeTreesClient;
  let pedersen: Pedersen;

  beforeAll(async () => {
    const config = await getWorldStateConfig(logger);
    if (!config?.worldStateBinaryPath) {
      throw new Error(`Native world state required!`);
    }
    nativeClient = NativeTreesClient.init(config);
    pedersen = new Pedersen();
  });

  afterAll(async () => {
    await nativeClient.terminate();
  });

  it('creates a new indexed tree', async () => {
    const treeName = "Public Data Tree";
    const response = await nativeClient.sendStartTree(treeName, 32);
    expect(response.success).toBeTruthy();

    const response2 = await nativeClient.sendStartTree(treeName, 33);
    expect(response2.success).toBeFalsy();
    expect(response2.message).toEqual("Tree already exists");
    expect(response2.depth).toBe(32);
  });

  it('returns the tree information', async () => {
    const treeName = "Test Tree 1";
    const response = await nativeClient.sendStartTree(treeName, TEST_TREE_DEPTH);
    expect(response.success).toBeTruthy();

    const getInfoResponse = await nativeClient.getTreeInfo(treeName);
    expect(getInfoResponse.success).toBeTruthy();
    expect(getInfoResponse.depth).toBe(TEST_TREE_DEPTH);
    expect(getInfoResponse.size).toBe(1);

    /**
     * Initial state:
     *
     *  index     0       1       2       3        4       5       6       7
     *  ---------------------------------------------------------------------
     *  val       0       0       0       0        0       0       0       0
     *  nextIdx   0       0       0       0        0       0       0       0
     *  nextVal   0       0       0       0        0       0       0       0.
     */

    const initialLeafHash = pedersen.hashInputs(createNullifierTreeLeafHashInputs(0, 0, 0));
    const level1ZeroHash = pedersen.hash(INITIAL_LEAF, INITIAL_LEAF);
    const level2ZeroHash = pedersen.hash(level1ZeroHash, level1ZeroHash);

    let index0Hash = initialLeafHash;
    // Each element is named by the level followed by the index on that level. E.g. e10 -> level 1, index 0, e21 -> level 2, index 1
    let e10 = pedersen.hash(index0Hash, INITIAL_LEAF);
    let e20 = pedersen.hash(e10, level1ZeroHash);

    let root = pedersen.hash(e20, level2ZeroHash);

    expect(getInfoResponse.root).toEqual(root);
  });

  it('inserts new leaves', async () => {
    const treeName = "Test Tree 2";
    const treeDepth = 32;
    const initialSize = 2 * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;
    const response = await nativeClient.sendStartTree(treeName, treeDepth, initialSize);
    expect(response.success).toBeTruthy();

    const getInfoResponse = await nativeClient.getTreeInfo(treeName);
    expect(getInfoResponse.success).toBeTruthy();
    expect(getInfoResponse.depth).toBe(treeDepth);
    expect(getInfoResponse.size).toBe(initialSize);

    const numLeavesToInsert = 12 * 1024;
    const leaves = Array.from({length: numLeavesToInsert}).map(Fr.random);
    const insertLeavesResponse = await nativeClient.insertLeaves(treeName, leaves);
    expect(insertLeavesResponse.success).toBeTruthy();
    expect(insertLeavesResponse.size).toBe(initialSize + leaves.length);
  }, 30_000);

  // it('should be able to find indexes of leaves', async () => {
  //   const db = openTmpStore();
  //   const tree = await createDb(db, pedersen, 'test', 3);
  //   const values = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)];

  //   await tree.appendLeaves([values[0]]);

  //   expect(tree.findLeafIndex(values[0], true)).toBeDefined();
  //   expect(tree.findLeafIndex(values[0], false)).toBe(undefined);
  //   expect(tree.findLeafIndex(values[1], true)).toBe(undefined);

  //   await tree.commit();

  //   expect(tree.findLeafIndex(values[0], false)).toBeDefined();
  // });
});
