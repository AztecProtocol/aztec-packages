import { type TreeInsertionStats } from '@aztec/circuit-types/stats';
import { type Bufferable, serializeToBuffer, FromBuffer } from '@aztec/foundation/serialize';
import { Timer } from '@aztec/foundation/timer';

import { AppendOnlySnapshotBuilder } from '../snapshots/append_only_snapshot.js';
import { type TreeSnapshot } from '../snapshots/snapshot_builder.js';
import { Hasher } from '@aztec/types/interfaces';
import { SnapshottedMerkleTree } from '../interfaces/merkle_tree.js';
import { SiblingPath } from '@aztec/circuit-types';
import { AztecKVStore } from '@aztec/kv-store';
import { INITIAL_LEAF, MAX_DEPTH } from '../tree_base.js';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class StandardTreeNative<T extends Bufferable = Buffer> implements SnapshottedMerkleTree<T> {
  #snapshotBuilder = new AppendOnlySnapshotBuilder(this.store, this, this.hasher, this.deserializer);
  private zeroHashes: Buffer[] = [];
  protected readonly maxIndex: bigint;
  protected log: DebugLogger;

  public constructor(
    protected store: AztecKVStore,
    protected hasher: Hasher,
    private name: string,
    private depth: number,
    protected size: bigint = 0n,
    protected deserializer: FromBuffer<T>,
    root?: Buffer,
  ) {
    if (!(depth >= 1 && depth <= MAX_DEPTH)) {
      throw Error('Invalid depth');
    }

    // Compute the zero values at each layer.
    let current = INITIAL_LEAF;
    for (let i = depth - 1; i >= 0; --i) {
      this.zeroHashes[i] = current;
      current = hasher.hash(current, current);
    }
    this.maxIndex = 2n ** BigInt(depth) - 1n;

    this.log = createDebugLogger(`aztec:merkle-tree:${name.toLowerCase()}`);
  }
  getName(): string {
    return this.name;
  }
  getNode(level: number, index: bigint): Promise<Buffer> {
    throw new Error('Method not implemented.');
  }
  getZeroHash(level: number): Buffer {
    return this.zeroHashes[level];
  }
  getRoot(includeUncommitted: boolean): Buffer {
    throw new Error('Method not implemented.');
  }
  getNumLeaves(includeUncommitted: boolean): bigint {
    throw new Error('Method not implemented.');
  }
  commit(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getDepth(): number {
    throw new Error('Method not implemented.');
  }
  rollback(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  getLeafValue(index: bigint, includeUncommitted: boolean): T | undefined {
    throw new Error('Method not implemented.');
  }
  getSiblingPath<N extends number>(index: bigint, includeUncommitted: boolean): Promise<SiblingPath<N>> {
    throw new Error('Method not implemented.');
  }

  /**
   * Appends the given leaves to the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public appendLeaves(leaves: T[]): Promise<void> {

    return Promise.resolve();
  }

  public snapshot(blockNumber: number): Promise<TreeSnapshot<T>> {
    return this.#snapshotBuilder.snapshot(blockNumber);
  }

  public getSnapshot(blockNumber: number): Promise<TreeSnapshot<T>> {
    return this.#snapshotBuilder.getSnapshot(blockNumber);
  }

  public findLeafIndex(value: T, includeUncommitted: boolean): bigint | undefined {
    return this.findLeafIndexAfter(value, 0n, includeUncommitted);
  }

  public findLeafIndexAfter(value: T, startIndex: bigint, includeUncommitted: boolean): bigint | undefined {
    const buffer = serializeToBuffer(value);
    for (let i = startIndex; i < this.getNumLeaves(includeUncommitted); i++) {
      const currentValue = this.getLeafValue(i, includeUncommitted);
      if (currentValue && serializeToBuffer(currentValue).equals(buffer)) {
        return i;
      }
    }
    return undefined;
  }
}
