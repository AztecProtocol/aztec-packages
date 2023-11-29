import levelup, { LevelUp } from 'levelup';

import { Pedersen, StandardTree, newTree } from '../index.js';
import { createMemDown } from '../test/utils/create_mem_down.js';
import { AppendOnlySnapshotBuilder } from './append_only_snapshot.js';
import { describeSnapshotBuilderTestSuite } from './snapshot_builder_test_suite.js';

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

  it('takes snapshots', async () => {
    await tree.appendLeaves([Buffer.from('a'), Buffer.from('b'), Buffer.from('c')]);
    await tree.commit();

    const expectedPathAtSnapshot1 = await tree.getSiblingPath(1n, false);

    const snapshot1 = await snapshotBuilder.snapshot(1);

    await tree.appendLeaves([Buffer.from('d'), Buffer.from('e'), Buffer.from('f')]);
    await tree.commit();

    const expectedPathAtSnapshot2 = await tree.getSiblingPath(1n, false);

    const snapshot2 = await snapshotBuilder.snapshot(2);

    await expect(snapshot1.getSiblingPath(1n, false)).resolves.toEqual(expectedPathAtSnapshot1);
    await expect(snapshot2.getSiblingPath(1n, false)).resolves.toEqual(expectedPathAtSnapshot2);
  });

  describeSnapshotBuilderTestSuite(
    () => tree,
    () => snapshotBuilder,
    async tree => {
      const newLeaves = Array.from({ length: 2 }).map(() => Buffer.from(Math.random().toString()));
      await tree.appendLeaves(newLeaves);
    },
  );
});
