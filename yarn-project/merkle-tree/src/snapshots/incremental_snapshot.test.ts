import levelup, { LevelUp } from 'levelup';

import { Pedersen, StandardTree, newTree } from '../index.js';
import { createMemDown } from '../test/utils/create_mem_down.js';
import { IncrementalSnapshotBuilder } from './incremental_snapshot.js';
import { describeSnapshotBuilderTestSuite } from './snapshot_builder_test_suite.js';

describe('FullSnapshotBuilder', () => {
  let tree: StandardTree;
  let snapshotBuilder: IncrementalSnapshotBuilder;
  let db: LevelUp;

  beforeEach(async () => {
    db = levelup(createMemDown());
    tree = await newTree(StandardTree, db, new Pedersen(), 'test', 4);
    snapshotBuilder = new IncrementalSnapshotBuilder(db, tree);
  });

  describeSnapshotBuilderTestSuite(
    () => tree,
    () => snapshotBuilder,
    async () => {
      const newLeaves = Array.from({ length: 2 }).map(() => Buffer.from(Math.random().toString()));
      await tree.appendLeaves(newLeaves);
    },
  );
});
