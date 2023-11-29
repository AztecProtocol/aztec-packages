import { TreeBase } from '../tree_base.js';
import { SnapshotBuilder } from './snapshot_builder.js';

/** Creates a test suit for snapshots */
export function describeSnapshotBuilderTestSuite<T extends TreeBase, S extends SnapshotBuilder>(
  getTree: () => T,
  getSnapshotBuilder: () => S,
  modifyTree: (tree: T) => Promise<void>,
) {
  describe('SnapshotBuilder', () => {
    let tree: T;
    let snapshotBuilder: S;
    let leaves: bigint[];

    beforeEach(() => {
      tree = getTree();
      snapshotBuilder = getSnapshotBuilder();

      leaves = Array.from({ length: 4 }).map(() => BigInt(Math.floor(Math.random() * 2 ** tree.getDepth())));
    });

    describe('snapshot', () => {
      it('takes snapshots', async () => {
        await modifyTree(tree);
        await tree.commit();
        await expect(snapshotBuilder.snapshot(1)).resolves.toBeDefined();
      });

      it('refuses to take the same snapshot twice', async () => {
        await modifyTree(tree);
        await tree.commit();

        const version = 1;
        await snapshotBuilder.snapshot(version);
        await expect(snapshotBuilder.snapshot(version)).rejects.toThrow();
      });

      it('returns the same path if tree has not advanced', async () => {
        await modifyTree(tree);
        await tree.commit();
        const snapshot = await snapshotBuilder.snapshot(1);

        const historicPaths = await Promise.all(leaves.map(leaf => snapshot.getSiblingPath(leaf, false)));
        const expectedPaths = await Promise.all(leaves.map(leaf => tree.getSiblingPath(leaf, false)));

        for (const [index, path] of historicPaths.entries()) {
          expect(path).toEqual(expectedPaths[index]);
        }
      });

      it('returns historic paths if tree has diverged and no new snapshots have been taken', async () => {
        await modifyTree(tree);
        await tree.commit();
        const snapshot = await snapshotBuilder.snapshot(1);

        const expectedPaths = await Promise.all(leaves.map(leaf => tree.getSiblingPath(leaf, false)));

        await modifyTree(tree);
        await tree.commit();

        const historicPaths = await Promise.all(leaves.map(leaf => snapshot.getSiblingPath(leaf, false)));

        for (const [index, path] of historicPaths.entries()) {
          expect(path).toEqual(expectedPaths[index]);
        }
      });

      it('returns historic paths at old snapshots', async () => {
        await modifyTree(tree);
        await tree.commit();
        const snapshot = await snapshotBuilder.snapshot(1);

        const historicPaths = await Promise.all(leaves.map(leaf => snapshot.getSiblingPath(leaf, false)));
        const expectedPaths = await Promise.all(leaves.map(leaf => tree.getSiblingPath(leaf, false)));

        await modifyTree(tree);
        await tree.commit();

        await snapshotBuilder.snapshot(2);

        for (const [index, path] of historicPaths.entries()) {
          expect(path).toEqual(expectedPaths[index]);
        }
      });

      it('retains old snapshots even if new one are created', async () => {
        await modifyTree(tree);
        await tree.commit();

        const expectedPaths = await Promise.all(leaves.map(leaf => tree.getSiblingPath(leaf, false)));

        const snapshot = await snapshotBuilder.snapshot(1);

        await modifyTree(tree);
        await tree.commit();

        await snapshotBuilder.snapshot(2);

        // check that snapshot 2 has not influenced snapshot(1) at all
        const historicPaths = await Promise.all(leaves.map(leaf => snapshot.getSiblingPath(leaf, false)));

        for (const [index, path] of historicPaths.entries()) {
          expect(path).toEqual(expectedPaths[index]);
        }
      });
    });

    describe('getSnapshot', () => {
      it('returns old snapshots', async () => {
        await modifyTree(tree);
        await tree.commit();
        const expectedPaths = await Promise.all(leaves.map(leaf => tree.getSiblingPath(leaf, false)));
        await snapshotBuilder.snapshot(1);

        for (let i = 2; i < 5; i++) {
          await modifyTree(tree);
          await tree.commit();
          await snapshotBuilder.snapshot(i);
        }

        const firstSnapshot = await snapshotBuilder.getSnapshot(1);
        const historicPaths = await Promise.all(leaves.map(leaf => firstSnapshot.getSiblingPath(leaf, false)));

        for (const [index, path] of historicPaths.entries()) {
          expect(path).toEqual(expectedPaths[index]);
        }
      });

      it('throws if an unknown snapshot is requested', async () => {
        await modifyTree(tree);
        await tree.commit();
        await snapshotBuilder.snapshot(1);

        await expect(snapshotBuilder.getSnapshot(2)).rejects.toThrow();
      });
    });
  });
}
