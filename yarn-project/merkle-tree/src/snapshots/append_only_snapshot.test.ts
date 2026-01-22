import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { FromBuffer } from '@aztec/foundation/serialize';
import type { AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { Pedersen, StandardTree, newTree } from '../index.js';
import { AppendOnlySnapshotBuilder } from './append_only_snapshot.js';
import { describeSnapshotBuilderTestSuite } from './snapshot_builder_test_suite.js';

const logger = createLogger('merkle-tree:test:append-only-snapshot');

describe('AppendOnlySnapshot', () => {
  let tree: StandardTree;
  let snapshotBuilder: AppendOnlySnapshotBuilder<Buffer>;
  let db: AztecKVStore;

  beforeEach(async () => {
    db = openTmpStore(logger);
    const hasher = new Pedersen();
    const deserializer: FromBuffer<Buffer> = { fromBuffer: b => b };
    tree = await newTree(StandardTree, db, hasher, 'test', deserializer, 4, logger);
    snapshotBuilder = new AppendOnlySnapshotBuilder(db, tree, hasher, deserializer);
  });

  describeSnapshotBuilderTestSuite(
    () => tree,
    () => snapshotBuilder,
    tree => {
      const newLeaves = Array.from({ length: 2 }).map(() => Fr.random().toBuffer());
      tree.appendLeaves(newLeaves);
      return Promise.resolve();
    },
  );
});
