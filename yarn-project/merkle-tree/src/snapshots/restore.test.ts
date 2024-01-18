import { Fr, NullifierLeaf, NullifierLeafPreimage } from '@aztec/circuits.js';
import { Hasher } from '@aztec/types/interfaces';

import levelup, { LevelUp } from 'levelup';

import { StandardIndexedTreeWithAppend } from '../standard_indexed_tree/test/standard_indexed_tree_with_append.js';
import { IndexedTreeSnapshotBuilder } from './indexed_tree_snapshot.js';
import { Pedersen, StandardTree, newTree } from '../index.js';
import { createMemDown } from '../test/utils/create_mem_down.js';
import { AppendOnlySnapshotBuilder } from './append_only_snapshot.js';
import { buildDbKeyForLeafIndex } from '../standard_indexed_tree/standard_indexed_tree.js';
// import { describeSnapshotBuilderTestSuite } from './snapshot_builder_test_suite.js';

describe('AppendOnlySnapshot', () => {
  let tree: StandardTree;
  let snapshotBuilder: AppendOnlySnapshotBuilder;
  let db: LevelUp;

  beforeEach(async () => {
    db = levelup(createMemDown());
    const hasher = new Pedersen();
    tree = await newTree(StandardTree, db, hasher, 'test', 4);
    snapshotBuilder = new AppendOnlySnapshotBuilder(db, tree, hasher);
  });


  describe('test', () => {
    it('test', async () => {
      await tree.appendLeaves([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
      await tree.commit();
      const rootAtBlock1 = tree.getRoot(false);

      const treeAtBlock1 = await Promise.all([
        tree.getNode(0, 0n),
        tree.getNode(1, 0n),
        tree.getNode(1, 1n),
        tree.getNode(2, 0n),
        tree.getNode(2, 1n),
        tree.getNode(2, 2n),
        tree.getNode(2, 3n),
        tree.getNode(3, 0n),
        tree.getNode(3, 1n),
        tree.getNode(3, 2n),
        tree.getNode(3, 3n),
        tree.getNode(3, 4n),
        tree.getNode(3, 5n),
        tree.getNode(3, 6n),
        tree.getNode(3, 7n),
        tree.getNode(4, 0n),
        tree.getNode(4, 1n),
        tree.getNode(4, 2n),
        tree.getNode(4, 3n),
        tree.getNode(4, 4n),
        tree.getNode(4, 5n),
        tree.getNode(4, 6n),
        tree.getNode(4, 7n),
        tree.getNode(4, 8n),
        tree.getNode(4, 9n),
        tree.getNode(4, 10n),
        tree.getNode(4, 11n),
        tree.getNode(4, 12n),
        tree.getNode(4, 13n),
        tree.getNode(4, 14n),
        tree.getNode(4, 15n),
      ])

      const snapshot1 = await snapshotBuilder.snapshot(1);

      await tree.appendLeaves([Buffer.from('d'), Buffer.from('e'), Buffer.from('f')]);
      await tree.commit();

      const rootAtBlock2 = tree.getRoot(false);

      const treeAtBlock2 = await Promise.all([
        tree.getNode(0, 0n),
        tree.getNode(1, 0n),
        tree.getNode(1, 1n),
        tree.getNode(2, 0n),
        tree.getNode(2, 1n),
        tree.getNode(2, 2n),
        tree.getNode(2, 3n),
        tree.getNode(3, 0n),
        tree.getNode(3, 1n),
        tree.getNode(3, 2n),
        tree.getNode(3, 3n),
        tree.getNode(3, 4n),
        tree.getNode(3, 5n),
        tree.getNode(3, 6n),
        tree.getNode(3, 7n),
        tree.getNode(4, 0n),
        tree.getNode(4, 1n),
        tree.getNode(4, 2n),
        tree.getNode(4, 3n),
        tree.getNode(4, 4n),
        tree.getNode(4, 5n),
        tree.getNode(4, 6n),
        tree.getNode(4, 7n),
        tree.getNode(4, 8n),
        tree.getNode(4, 9n),
        tree.getNode(4, 10n),
        tree.getNode(4, 11n),
        tree.getNode(4, 12n),
        tree.getNode(4, 13n),
        tree.getNode(4, 14n),
        tree.getNode(4, 15n),
      ])

      const snapshot2 = await snapshotBuilder.snapshot(2);

      expect(rootAtBlock1).not.toStrictEqual(rootAtBlock2);
      expect(treeAtBlock1).not.toStrictEqual(treeAtBlock2);

      await tree.appendLeaves([Buffer.from('g'), Buffer.from('h'), Buffer.from('i')]);
      await tree.commit();

      const rootAtBlock3 = tree.getRoot(false);

      const treeAtBlock3 = await Promise.all([
        tree.getNode(0, 0n),
        tree.getNode(1, 0n),
        tree.getNode(1, 1n),
        tree.getNode(2, 0n),
        tree.getNode(2, 1n),
        tree.getNode(2, 2n),
        tree.getNode(2, 3n),
        tree.getNode(3, 0n),
        tree.getNode(3, 1n),
        tree.getNode(3, 2n),
        tree.getNode(3, 3n),
        tree.getNode(3, 4n),
        tree.getNode(3, 5n),
        tree.getNode(3, 6n),
        tree.getNode(3, 7n),
        tree.getNode(4, 0n),
        tree.getNode(4, 1n),
        tree.getNode(4, 2n),
        tree.getNode(4, 3n),
        tree.getNode(4, 4n),
        tree.getNode(4, 5n),
        tree.getNode(4, 6n),
        tree.getNode(4, 7n),
        tree.getNode(4, 8n),
        tree.getNode(4, 9n),
        tree.getNode(4, 10n),
        tree.getNode(4, 11n),
        tree.getNode(4, 12n),
        tree.getNode(4, 13n),
        tree.getNode(4, 14n),
        tree.getNode(4, 15n),
      ])

      const snapshot3 = await snapshotBuilder.snapshot(3);

      expect(rootAtBlock2).not.toStrictEqual(rootAtBlock3);
      expect(treeAtBlock2).not.toStrictEqual(treeAtBlock3);

      await tree.appendLeaves([Buffer.from('k'), Buffer.from('l'), Buffer.from('m')]);
      await tree.commit();
      const rootAtBlock4 = tree.getRoot(false);

      const treeAtBlock4 = await Promise.all([
        tree.getNode(0, 0n),
        tree.getNode(1, 0n),
        tree.getNode(1, 1n),
        tree.getNode(2, 0n),
        tree.getNode(2, 1n),
        tree.getNode(2, 2n),
        tree.getNode(2, 3n),
        tree.getNode(3, 0n),
        tree.getNode(3, 1n),
        tree.getNode(3, 2n),
        tree.getNode(3, 3n),
        tree.getNode(3, 4n),
        tree.getNode(3, 5n),
        tree.getNode(3, 6n),
        tree.getNode(3, 7n),
        tree.getNode(4, 0n),
        tree.getNode(4, 1n),
        tree.getNode(4, 2n),
        tree.getNode(4, 3n),
        tree.getNode(4, 4n),
        tree.getNode(4, 5n),
        tree.getNode(4, 6n),
        tree.getNode(4, 7n),
        tree.getNode(4, 8n),
        tree.getNode(4, 9n),
        tree.getNode(4, 10n),
        tree.getNode(4, 11n),
        tree.getNode(4, 12n),
        tree.getNode(4, 13n),
        tree.getNode(4, 14n),
        tree.getNode(4, 15n),
      ]);

      expect(rootAtBlock3).not.toStrictEqual(rootAtBlock4);
      expect(treeAtBlock3).not.toStrictEqual(treeAtBlock4);

      const snapshot4 = await snapshotBuilder.snapshot(4);

      await tree.restore(2);

      const rootRestoredAtBlock2 = tree.getRoot(false);

      const treeRestoredAtBlock2 = await Promise.all([
        tree.getNode(0, 0n),
        tree.getNode(1, 0n),
        tree.getNode(1, 1n),
        tree.getNode(2, 0n),
        tree.getNode(2, 1n),
        tree.getNode(2, 2n),
        tree.getNode(2, 3n),
        tree.getNode(3, 0n),
        tree.getNode(3, 1n),
        tree.getNode(3, 2n),
        tree.getNode(3, 3n),
        tree.getNode(3, 4n),
        tree.getNode(3, 5n),
        tree.getNode(3, 6n),
        tree.getNode(3, 7n),
        tree.getNode(4, 0n),
        tree.getNode(4, 1n),
        tree.getNode(4, 2n),
        tree.getNode(4, 3n),
        tree.getNode(4, 4n),
        tree.getNode(4, 5n),
        tree.getNode(4, 6n),
        tree.getNode(4, 7n),
        tree.getNode(4, 8n),
        tree.getNode(4, 9n),
        tree.getNode(4, 10n),
        tree.getNode(4, 11n),
        tree.getNode(4, 12n),
        tree.getNode(4, 13n),
        tree.getNode(4, 14n),
        tree.getNode(4, 15n),
      ]);

      console.log(treeAtBlock2)
      console.log(treeRestoredAtBlock2)


      expect(rootAtBlock2).toStrictEqual(rootRestoredAtBlock2);
      expect(treeAtBlock2).toStrictEqual(treeRestoredAtBlock2);

      await expect(snapshotBuilder.getSnapshot(3)).rejects.toThrow();

      await tree.appendLeaves([Buffer.from('z'), Buffer.from('y'), Buffer.from('x')]);
      await tree.commit();

      const snapshot3New = await snapshotBuilder.snapshot(3);

      const indexZAtBlock3 = await tree.findLeafIndex(Buffer.from('z'), false);

      await tree.appendLeaves([Buffer.from('w'), Buffer.from('v'), Buffer.from('u')]);
      await tree.commit();

      const snapshot4New = await snapshotBuilder.snapshot(4);

      await tree.restore(3);

      const indexZAtSnap3 = await tree.findLeafIndex(Buffer.from('z'), false);

      expect(indexZAtBlock3).toEqual(indexZAtSnap3);
    });
  });
});

class NullifierTree extends StandardIndexedTreeWithAppend {
  constructor(db: levelup.LevelUp, hasher: Hasher, name: string, depth: number, size: bigint = 0n, root?: Buffer) {
    super(db, hasher, name, depth, size, NullifierLeafPreimage, NullifierLeaf, root);
  }
}

describe('IndexedTreeSnapshotBuilder', () => {
  it('should work', async () => {
    const db = levelup(createMemDown());
    const tree = await newTree(NullifierTree, db, new Pedersen(), 'test', 4);
    const snapshotBuilder = new IndexedTreeSnapshotBuilder(db, tree, NullifierLeafPreimage);

    await tree.appendLeaves([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    await tree.commit();

    const rootAtBlock1 = tree.getRoot(false);

    const treeAtBlock1 = await Promise.all([
      tree.getNode(0, 0n),
      tree.getNode(1, 0n),
      tree.getNode(1, 1n),
      tree.getNode(2, 0n),
      tree.getNode(2, 1n),
      tree.getNode(2, 2n),
      tree.getNode(2, 3n),
      tree.getNode(3, 0n),
      tree.getNode(3, 1n),
      tree.getNode(3, 2n),
      tree.getNode(3, 3n),
      tree.getNode(3, 4n),
      tree.getNode(3, 5n),
      tree.getNode(3, 6n),
      tree.getNode(3, 7n),
      tree.getNode(4, 0n),
      tree.getNode(4, 1n),
      tree.getNode(4, 2n),
      tree.getNode(4, 3n),
      tree.getNode(4, 4n),
      tree.getNode(4, 5n),
      tree.getNode(4, 6n),
      tree.getNode(4, 7n),
      tree.getNode(4, 8n),
      tree.getNode(4, 9n),
      tree.getNode(4, 10n),
      tree.getNode(4, 11n),
      tree.getNode(4, 12n),
      tree.getNode(4, 13n),
      tree.getNode(4, 14n),
      tree.getNode(4, 15n),
    ])

    const leavesAtBlock1 = await Promise.all([
      tree.getLatestLeafPreimageCopy(0n, false),
      tree.getLatestLeafPreimageCopy(1n, false),
      tree.getLatestLeafPreimageCopy(2n, false),
      tree.getLatestLeafPreimageCopy(3n, false),
      tree.getLatestLeafPreimageCopy(4n, false),
      tree.getLatestLeafPreimageCopy(5n, false),
      tree.getLatestLeafPreimageCopy(6n, false),
      tree.getLatestLeafPreimageCopy(7n, false),
      tree.getLatestLeafPreimageCopy(8n, false),
      tree.getLatestLeafPreimageCopy(9n, false),
      tree.getLatestLeafPreimageCopy(10n, false),
      tree.getLatestLeafPreimageCopy(11n, false),
      tree.getLatestLeafPreimageCopy(12n, false),
      tree.getLatestLeafPreimageCopy(13n, false),
      tree.getLatestLeafPreimageCopy(14n, false),
      tree.getLatestLeafPreimageCopy(15n, false),
    ]);

    const keysOfLeavesAtBlock1 = await Promise.all(leavesAtBlock1.map(
      (val) => val ? db.get(buildDbKeyForLeafIndex(tree.getName(), val!.getKey())) : undefined
      )
    );

    await snapshotBuilder.snapshot(1);

    await tree.appendLeaves([Buffer.from('d'), Buffer.from('e'), Buffer.from('f')]);
    await tree.commit();

    const rootAtBlock2 = tree.getRoot(false);

    const treeAtBlock2 = await Promise.all([
      tree.getNode(0, 0n),
      tree.getNode(1, 0n),
      tree.getNode(1, 1n),
      tree.getNode(2, 0n),
      tree.getNode(2, 1n),
      tree.getNode(2, 2n),
      tree.getNode(2, 3n),
      tree.getNode(3, 0n),
      tree.getNode(3, 1n),
      tree.getNode(3, 2n),
      tree.getNode(3, 3n),
      tree.getNode(3, 4n),
      tree.getNode(3, 5n),
      tree.getNode(3, 6n),
      tree.getNode(3, 7n),
      tree.getNode(4, 0n),
      tree.getNode(4, 1n),
      tree.getNode(4, 2n),
      tree.getNode(4, 3n),
      tree.getNode(4, 4n),
      tree.getNode(4, 5n),
      tree.getNode(4, 6n),
      tree.getNode(4, 7n),
      tree.getNode(4, 8n),
      tree.getNode(4, 9n),
      tree.getNode(4, 10n),
      tree.getNode(4, 11n),
      tree.getNode(4, 12n),
      tree.getNode(4, 13n),
      tree.getNode(4, 14n),
      tree.getNode(4, 15n),
    ])

    const leavesAtBlock2 = await Promise.all([
      tree.getLatestLeafPreimageCopy(0n, false),
      tree.getLatestLeafPreimageCopy(1n, false),
      tree.getLatestLeafPreimageCopy(2n, false),
      tree.getLatestLeafPreimageCopy(3n, false),
      tree.getLatestLeafPreimageCopy(4n, false),
      tree.getLatestLeafPreimageCopy(5n, false),
      tree.getLatestLeafPreimageCopy(6n, false),
      tree.getLatestLeafPreimageCopy(7n, false),
      tree.getLatestLeafPreimageCopy(8n, false),
      tree.getLatestLeafPreimageCopy(9n, false),
      tree.getLatestLeafPreimageCopy(10n, false),
      tree.getLatestLeafPreimageCopy(11n, false),
      tree.getLatestLeafPreimageCopy(12n, false),
      tree.getLatestLeafPreimageCopy(13n, false),
      tree.getLatestLeafPreimageCopy(14n, false),
      tree.getLatestLeafPreimageCopy(15n, false),
    ]);

    const keysOfLeavesAtBlock2 = await Promise.all(leavesAtBlock2.map(
      (val) => val ? db.get(buildDbKeyForLeafIndex(tree.getName(), val!.getKey())) : undefined
      )
    );

    expect(rootAtBlock1).not.toStrictEqual(rootAtBlock2);
    expect(treeAtBlock1).not.toStrictEqual(treeAtBlock2);
    expect(leavesAtBlock1).not.toStrictEqual(leavesAtBlock2);
    expect(keysOfLeavesAtBlock1).not.toStrictEqual(keysOfLeavesAtBlock2);

    await snapshotBuilder.snapshot(2);
    await snapshotBuilder.restore(1);

    const treeRootRestoredAtBlock1 = tree.getRoot(false);

    const treeRestoredAtBlock1 = await Promise.all([
      tree.getNode(0, 0n),
      tree.getNode(1, 0n),
      tree.getNode(1, 1n),
      tree.getNode(2, 0n),
      tree.getNode(2, 1n),
      tree.getNode(2, 2n),
      tree.getNode(2, 3n),
      tree.getNode(3, 0n),
      tree.getNode(3, 1n),
      tree.getNode(3, 2n),
      tree.getNode(3, 3n),
      tree.getNode(3, 4n),
      tree.getNode(3, 5n),
      tree.getNode(3, 6n),
      tree.getNode(3, 7n),
      tree.getNode(4, 0n),
      tree.getNode(4, 1n),
      tree.getNode(4, 2n),
      tree.getNode(4, 3n),
      tree.getNode(4, 4n),
      tree.getNode(4, 5n),
      tree.getNode(4, 6n),
      tree.getNode(4, 7n),
      tree.getNode(4, 8n),
      tree.getNode(4, 9n),
      tree.getNode(4, 10n),
      tree.getNode(4, 11n),
      tree.getNode(4, 12n),
      tree.getNode(4, 13n),
      tree.getNode(4, 14n),
      tree.getNode(4, 15n),
    ])

    const leavesRestoredAtBlock1 = await Promise.all([
      tree.getLatestLeafPreimageCopy(0n, false),
      tree.getLatestLeafPreimageCopy(1n, false),
      tree.getLatestLeafPreimageCopy(2n, false),
      tree.getLatestLeafPreimageCopy(3n, false),
      tree.getLatestLeafPreimageCopy(4n, false),
      tree.getLatestLeafPreimageCopy(5n, false),
      tree.getLatestLeafPreimageCopy(6n, false),
      tree.getLatestLeafPreimageCopy(7n, false),
      tree.getLatestLeafPreimageCopy(8n, false),
      tree.getLatestLeafPreimageCopy(9n, false),
      tree.getLatestLeafPreimageCopy(10n, false),
      tree.getLatestLeafPreimageCopy(11n, false),
      tree.getLatestLeafPreimageCopy(12n, false),
      tree.getLatestLeafPreimageCopy(13n, false),
      tree.getLatestLeafPreimageCopy(14n, false),
      tree.getLatestLeafPreimageCopy(15n, false),
    ]);

    const keysOfLeavesRestoredAtBlock1 = await Promise.all(leavesRestoredAtBlock1.map(
      (val) => val ? db.get(buildDbKeyForLeafIndex(tree.getName(), val!.getKey())) : undefined
      )
    );

    expect(rootAtBlock1).toStrictEqual(treeRootRestoredAtBlock1);
    expect(treeAtBlock1).toStrictEqual(treeRestoredAtBlock1);
    expect(leavesAtBlock1).toStrictEqual(leavesRestoredAtBlock1);
    expect(keysOfLeavesAtBlock1).toStrictEqual(keysOfLeavesRestoredAtBlock1);

  })
});
