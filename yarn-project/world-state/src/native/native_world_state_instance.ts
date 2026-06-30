import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { IndexedTreeId, TreeInfo } from '@aztec/stdlib/interfaces/server';
import type { MerkleTreeId } from '@aztec/stdlib/trees';
import type { WorldStateRevision } from '@aztec/stdlib/world-state';

import type {
  BlockStateReference,
  SerializedBatchInsertionResult,
  SerializedIndexedLeaf,
  SerializedLeafValue,
  SerializedSequentialInsertionResult,
  SerializedSiblingPathAndIndex,
  TreeStateReference,
  WorldStateStatusFull,
  WorldStateStatusSummary,
} from './message.js';

/**
 * Backend-agnostic handle to a running aztec-wsdb world state, accessed by the TS layer.
 *
 * The legacy in-process NAPI implementation has been removed; the C++ AVM (NAPI) now connects to
 * the same aztec-wsdb process using the IPC path returned by {@link getIpcPath}.
 */
export interface NativeWorldStateInstance {
  getTreeInfo(treeId: MerkleTreeId, revision: WorldStateRevision): Promise<TreeInfo>;
  getStateReference(revision: WorldStateRevision): Promise<Record<number, TreeStateReference>>;
  getInitialStateReference(): Promise<Record<number, TreeStateReference>>;
  getLeafValue(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leafIndex: bigint,
  ): Promise<SerializedLeafValue | undefined>;
  getLeafPreimage(
    treeId: IndexedTreeId,
    revision: WorldStateRevision,
    leafIndex: bigint,
  ): Promise<SerializedIndexedLeaf | undefined>;
  getSiblingPath(treeId: MerkleTreeId, revision: WorldStateRevision, leafIndex: bigint): Promise<Buffer[]>;
  getBlockNumbersForLeafIndices(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]>;
  findLeafIndices(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leaves: SerializedLeafValue[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]>;
  findLowLeaf(
    treeId: IndexedTreeId,
    revision: WorldStateRevision,
    key: Fr,
  ): Promise<{ index: bigint; alreadyPresent: boolean }>;
  findSiblingPaths(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leaves: SerializedLeafValue[],
  ): Promise<(SerializedSiblingPathAndIndex | undefined)[]>;
  updateArchive(forkId: number, blockStateRef: BlockStateReference, blockHeaderHash: Buffer): Promise<void>;
  appendLeaves(treeId: MerkleTreeId, forkId: number, leaves: SerializedLeafValue[]): Promise<void>;
  batchInsert(
    treeId: IndexedTreeId,
    forkId: number,
    leaves: SerializedLeafValue[],
    subtreeDepth: number,
  ): Promise<SerializedBatchInsertionResult>;
  sequentialInsert(
    treeId: IndexedTreeId,
    forkId: number,
    leaves: SerializedLeafValue[],
  ): Promise<SerializedSequentialInsertionResult>;
  syncBlock(input: {
    blockNumber: BlockNumber;
    blockStateRef: BlockStateReference;
    blockHeaderHash: Buffer;
    expectedArchiveRoot: Buffer;
    expectedPreviousArchiveRoot: Buffer;
    paddedNoteHashes: readonly SerializedLeafValue[];
    paddedL1ToL2Messages: readonly SerializedLeafValue[];
    paddedNullifiers: readonly SerializedLeafValue[];
    publicDataWrites: readonly SerializedLeafValue[];
  }): Promise<WorldStateStatusFull>;
  createFork(input: { latest: boolean; blockNumber: BlockNumber }): Promise<number>;
  deleteFork(forkId: number): Promise<void>;
  finalizeBlocks(toBlockNumber: BlockNumber): Promise<WorldStateStatusSummary>;
  unwindBlocks(toBlockNumber: BlockNumber): Promise<WorldStateStatusFull>;
  removeHistoricalBlocks(toBlockNumber: BlockNumber): Promise<WorldStateStatusFull>;
  getStatus(): Promise<WorldStateStatusSummary>;
  createCheckpoint(forkId: number): Promise<number>;
  commitCheckpoint(forkId: number): Promise<void>;
  revertCheckpoint(forkId: number): Promise<void>;
  commitAllCheckpoints(forkId: number, depth: number): Promise<void>;
  revertAllCheckpoints(forkId: number, depth: number): Promise<void>;
  copyStores(dstPath: string, compact: boolean): Promise<void>;

  /**
   * IPC path the underlying aztec-wsdb process listens on. The C++ AVM uses this to attach to the
   * same world state instance the TS layer is using.
   */
  getIpcPath(): string;

  /**
   * Shut down the world state instance. Cancels any in-flight queues, closes the IPC channel, and
   * terminates the underlying aztec-wsdb process. Idempotent.
   */
  close(): Promise<void>;
}
