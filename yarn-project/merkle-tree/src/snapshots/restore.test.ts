import { Fr, NullifierLeaf, NullifierLeafPreimage } from '@aztec/circuits.js';
import { Hasher } from '@aztec/types/interfaces';

import levelup, { LevelUp } from 'levelup';

import { StandardIndexedTreeWithAppend } from '../standard_indexed_tree/test/standard_indexed_tree_with_append.js';
import { IndexedTreeSnapshotBuilder } from './indexed_tree_snapshot.js';
import { Pedersen, StandardTree, newTree } from '../index.js';
import { createMemDown } from '../test/utils/create_mem_down.js';
import { AppendOnlySnapshotBuilder } from './append_only_snapshot.js';
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
      const snapshot1 = await snapshotBuilder.snapshot(1);
      await tree.appendLeaves([Buffer.from('d'), Buffer.from('e'), Buffer.from('f')]);
      await tree.commit();
      const snapshot2 = await snapshotBuilder.snapshot(2);
      await tree.appendLeaves([Buffer.from('g'), Buffer.from('h'), Buffer.from('i')]);
      await tree.commit();
      const snapshot3 = await snapshotBuilder.snapshot(3);
      await tree.appendLeaves([Buffer.from('k'), Buffer.from('l'), Buffer.from('m')]);
      await tree.commit();
      const snapshot4 = await snapshotBuilder.snapshot(4);
      //eslint-disable-next-line
      console.log(snapshot1.getNumLeaves());
      //eslint-disable-next-line
      console.log(snapshot2.getNumLeaves());
      //eslint-disable-next-line
      console.log(snapshot3.getNumLeaves());
      //eslint-disable-next-line
      console.log(snapshot4.getNumLeaves());
      //eslint-disable-next-line
      console.log(tree.getNumLeaves(false));
      //eslint-disable-next-line
      console.log(tree.getNumLeaves(true));

      await tree.restore(2);

      //eslint-disable-next-line
      console.log(tree.getNumLeaves(false));
      //eslint-disable-next-line
      console.log(tree.getNumLeaves(true));

      const getSnapshot1 = await snapshotBuilder.getSnapshot(1);
      //eslint-disable-next-line
      console.log(getSnapshot1?.getNumLeaves());

      try {
        const getSnapshot2 = await snapshotBuilder.getSnapshot(2);
        //eslint-disable-next-line
        console.log(getSnapshot2?.getNumLeaves());
      } catch (e) {
        console.log('correctly caught')
      }

      try {
        const getSnapshot3 = await snapshotBuilder.getSnapshot(3);
        //eslint-disable-next-line
        console.log(getSnapshot3?.getNumLeaves());
      } catch (e) {
        //eslint-disable-next-line
        console.log('correctly caught')
      }

      await tree.appendLeaves([Buffer.from('z'), Buffer.from('y'), Buffer.from('x')]);
      await tree.commit();
      const snapshot3New = await snapshotBuilder.snapshot(3);
      
      //eslint-disable-next-line
      console.log(snapshot3New.getNumLeaves());
      //eslint-disable-next-line
      console.log(tree.getNumLeaves(false));

      const indexZ = await tree.findLeafIndex(Buffer.from('z'), false);
      //eslint-disable-next-line
      console.log(indexZ);
      const indexZSnap = await snapshot3New.findLeafIndex(Buffer.from('z'));
      //eslint-disable-next-line
      console.log(indexZSnap);

      await tree.appendLeaves([Buffer.from('w'), Buffer.from('v'), Buffer.from('u')]);
      await tree.commit();

      await tree.restore(3);
      //eslint-disable-next-line
      console.log(await tree.getNode(1, 0n));

      console.log(await tree.getNode(2, 2n));

      const sibPath = await tree.getSiblingPath(15n, false);
      
      console.log(sibPath);

      //eslint-disable-next-line
      console.log(tree.getDepth());
    });
  });
//   describeSnapshotBuilderTestSuite(
//     () => tree,
//     () => snapshotBuilder,
//     async tree => {
//       const newLeaves = Array.from({ length: 2 }).map(() => Buffer.from(Math.random().toString()));
//       await tree.appendLeaves(newLeaves);
//     },
//   );
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
    console.log(await tree.getNode(1, 0n));

    console.log(await tree.getNode(2, 2n));

    const expectedLeavesAtBlock1 = await Promise.all([
      tree.getLatestLeafPreimageCopy(0n, false),
      tree.getLatestLeafPreimageCopy(1n, false),
      tree.getLatestLeafPreimageCopy(2n, false),
      // id'expect these to be undefined, but leaf 3 isn't?
      // must be some indexed-tree quirk I don't quite understand yet
      tree.getLatestLeafPreimageCopy(3n, false),
      tree.getLatestLeafPreimageCopy(4n, false),
      tree.getLatestLeafPreimageCopy(5n, false),
    ]);

    await snapshotBuilder.snapshot(1);

    await tree.appendLeaves([Buffer.from('d'), Buffer.from('e'), Buffer.from('f')]);
    await tree.commit();
    const expectedLeavesAtBlock2 = await Promise.all([
      tree.getLatestLeafPreimageCopy(0n, false),
      tree.getLatestLeafPreimageCopy(1n, false),
      tree.getLatestLeafPreimageCopy(2n, false),
      tree.getLatestLeafPreimageCopy(3n, false),
      tree.getLatestLeafPreimageCopy(4n, false),
      tree.getLatestLeafPreimageCopy(5n, false),
    ]);

    console.log(await tree.getNode(1, 0n));

    console.log(await tree.getNode(2, 2n));

    await snapshotBuilder.snapshot(2);

    const snapshot1 = await snapshotBuilder.getSnapshot(1);
    const actualLeavesAtBlock1 = await Promise.all([
      snapshot1.getLatestLeafPreimageCopy(0n),
      snapshot1.getLatestLeafPreimageCopy(1n),
      snapshot1.getLatestLeafPreimageCopy(2n),
      snapshot1.getLatestLeafPreimageCopy(3n),
      snapshot1.getLatestLeafPreimageCopy(4n),
      snapshot1.getLatestLeafPreimageCopy(5n),
    ]);
    expect(actualLeavesAtBlock1).toEqual(expectedLeavesAtBlock1);

    const snapshot2 = await snapshotBuilder.getSnapshot(2);
    const actualLeavesAtBlock2 = await Promise.all([
      snapshot2.getLatestLeafPreimageCopy(0n),
      snapshot2.getLatestLeafPreimageCopy(1n),
      snapshot2.getLatestLeafPreimageCopy(2n),
      snapshot2.getLatestLeafPreimageCopy(3n),
      snapshot2.getLatestLeafPreimageCopy(4n),
      snapshot2.getLatestLeafPreimageCopy(5n),
    ]);
    expect(actualLeavesAtBlock2).toEqual(expectedLeavesAtBlock2);

    await snapshotBuilder.restore(1);

    console.log(await tree.getNode(1, 0n));

    console.log(await tree.getNode(2, 2n));
  })
});
