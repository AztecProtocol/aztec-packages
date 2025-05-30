import { SerialQueue } from '@aztec/foundation/queue';
import type { IndexedTreeLeafPreimage, SiblingPath } from '@aztec/foundation/trees';
import type {
  BatchInsertionResult,
  IndexedTreeId,
  MerkleTreeId,
  MerkleTreeLeafType,
  MerkleTreeWriteOperations,
  SequentialInsertionResult,
  TreeInfo,
} from '@aztec/stdlib/trees';
import type { BlockHeader, StateReference } from '@aztec/stdlib/tx';

/**
 * Wraps an instance of `MerkleTreeWriteOperations` to allow the sequencer to gate access.
 * If transactions execution goes past the deadline, the simulator will continue to execute and update the world state
 * The public processor however requires that the world state remain constant after the deadline in order to finalise the block
 * The public processor provides this implementation of MerkleTreeWriteOperations to the simulator
 */

export class GuardedMerkleTreeOperations implements MerkleTreeWriteOperations {
  private isStopped = false;
  private serialQueue = new SerialQueue();

  constructor(private target: MerkleTreeWriteOperations) {
    this.serialQueue.start();
  }

  private guard() {
    if (this.isStopped) {
      throw new Error('Merkle tree access has been stopped');
    }
  }

  // Executes the provided function only if the guard is not stopped.
  private guardAndPush<T>(fn: () => Promise<T>): Promise<T> {
    this.guard();
    return this.serialQueue.put(() => {
      this.guard();
      return fn();
    });
  }

  public getUnderlyingFork(): MerkleTreeWriteOperations {
    return this.target;
  }

  // Stops all further access to the merkle trees via this object
  async stop(): Promise<void> {
    await this.serialQueue.put(() => {
      this.isStopped = true;
      return Promise.resolve();
    });
    return this.serialQueue.end();
  }

  // Proxy all methods to the target
  appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void> {
    return this.guardAndPush(() => this.target.appendLeaves(treeId, leaves));
  }

  updateArchive(header: BlockHeader): Promise<void> {
    return this.guardAndPush(() => this.target.updateArchive(header));
  }
  batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    return this.guardAndPush(() => this.target.batchInsert(treeId, leaves, subtreeHeight));
  }
  sequentialInsert<TreeHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
  ): Promise<SequentialInsertionResult<TreeHeight>> {
    return this.guardAndPush(() => this.target.sequentialInsert(treeId, leaves));
  }
  close(): Promise<void> {
    return this.guardAndPush(() => this.target.close());
  }
  getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo> {
    return this.guardAndPush(() => this.target.getTreeInfo(treeId));
  }
  getStateReference(): Promise<StateReference> {
    return this.guardAndPush(() => this.target.getStateReference());
  }
  getInitialHeader(): BlockHeader {
    return this.target.getInitialHeader();
  }
  getSiblingPath<N extends number>(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath<N>> {
    return this.guardAndPush(() => this.target.getSiblingPath(treeId, index));
  }
  getPreviousValueIndex<ID extends IndexedTreeId>(
    treeId: ID,
    value: bigint,
  ): Promise<{ index: bigint; alreadyPresent: boolean } | undefined> {
    return this.guardAndPush(() => this.target.getPreviousValueIndex(treeId, value));
  }
  getLeafPreimage<ID extends IndexedTreeId>(treeId: ID, index: bigint): Promise<IndexedTreeLeafPreimage | undefined> {
    return this.guardAndPush(() => this.target.getLeafPreimage(treeId, index));
  }
  findLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
  ): Promise<(bigint | undefined)[]> {
    return this.guardAndPush(() => this.target.findLeafIndices(treeId, values));
  }
  findLeafIndicesAfter<ID extends MerkleTreeId>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]> {
    return this.guardAndPush(() => this.target.findLeafIndicesAfter(treeId, values, startIndex));
  }
  getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<MerkleTreeLeafType<typeof treeId> | undefined> {
    return this.guardAndPush(() => this.target.getLeafValue(treeId, index));
  }
  getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    return this.guardAndPush(() => this.target.getBlockNumbersForLeafIndices(treeId, leafIndices));
  }
  createCheckpoint(): Promise<void> {
    return this.guardAndPush(() => this.target.createCheckpoint());
  }
  commitCheckpoint(): Promise<void> {
    return this.guardAndPush(() => this.target.commitCheckpoint());
  }
  revertCheckpoint(): Promise<void> {
    return this.guardAndPush(() => this.target.revertCheckpoint());
  }
  commitAllCheckpoints(): Promise<void> {
    return this.guardAndPush(() => this.target.commitAllCheckpoints());
  }
  revertAllCheckpoints(): Promise<void> {
    return this.guardAndPush(() => this.target.revertAllCheckpoints());
  }
  findSiblingPaths<ID extends MerkleTreeId, N extends number>(
    treeId: ID,
    values: MerkleTreeLeafType<ID>[],
  ): Promise<(SiblingPath<N> | undefined)[]> {
    return this.guardAndPush(() => this.target.findSiblingPaths(treeId, values));
  }
}
