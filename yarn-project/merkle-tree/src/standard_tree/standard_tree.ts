import { type TreeInsertionStats } from '@aztec/circuit-types/stats';
import { type Bufferable, serializeToBuffer } from '@aztec/foundation/serialize';
import { Timer } from '@aztec/foundation/timer';

import { type AppendOnlyTree } from '../interfaces/append_only_tree.js';
import { AppendOnlySnapshotBuilder } from '../snapshots/append_only_snapshot.js';
import { type TreeSnapshot } from '../snapshots/snapshot_builder.js';
import { TreeBase } from '../tree_base.js';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class StandardTree<T extends Bufferable = Buffer> extends TreeBase<T> implements AppendOnlyTree<T> {
  #snapshotBuilder = new AppendOnlySnapshotBuilder(this.store, this, this.hasher, this.deserializer);

  /**
   * Appends the given leaves to the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public override appendLeaves(leaves: T[]): Promise<void> {
    this.hasher.reset();
    const timer = new Timer();
    super.appendLeaves(leaves);
    this.log.debug(`Inserted ${leaves.length} leaves into ${this.getName()} tree`, {
      eventName: 'tree-insertion',
      duration: timer.ms(),
      batchSize: leaves.length,
      treeName: this.getName(),
      treeDepth: this.getDepth(),
      treeType: 'append-only',
      ...this.hasher.stats(),
    } satisfies TreeInsertionStats);

    return Promise.resolve();
  }

  public snapshot(blockNumber: number): Promise<TreeSnapshot<T>> {
    return this.#snapshotBuilder.snapshot(blockNumber);
  }

  public getSnapshot(blockNumber: number): Promise<TreeSnapshot<T>> {
    return this.#snapshotBuilder.getSnapshot(blockNumber);
  }

  public async findLeafIndex(value: T, includeUncommitted: boolean): Promise<bigint | undefined> {
    return await this.findLeafIndexAfter(value, 0n, includeUncommitted);
  }

  public async findLeafIndexAfter(
    value: T,
    startIndex: bigint,
    includeUncommitted: boolean,
  ): Promise<bigint | undefined> {
    const buffer = serializeToBuffer(value);
    for (let i = startIndex; i < this.getNumLeaves(includeUncommitted); i++) {
      const currentValue = await this.getLeafValue(i, includeUncommitted);
      if (currentValue && serializeToBuffer(currentValue).equals(buffer)) {
        return i;
      }
    }
    return undefined;
  }
}
