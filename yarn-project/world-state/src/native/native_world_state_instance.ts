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
<<<<<<< HEAD
  public async call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
    // allows for the pre-processing of responses on the job queue before being passed back
    responseHandler = (response: WorldStateResponse[T]): WorldStateResponse[T] => response,
    errorHandler = (_: string) => {},
  ): Promise<WorldStateResponse[T]> {
    // Here we determine which fork the request is being executed against and whether it requires uncommitted data
    // We use the fork Id to select the appropriate request queue and the uncommitted data flag to pass to the queue
    let forkId = -1;
    // We assume it includes uncommitted unless explicitly told otherwise
    let committedOnly = false;

    // Canonical requests ALWAYS go against the canonical fork
    // These include things like block syncs/unwinds etc
    // These requests don't contain a fork ID
    if (isWithCanonical(body)) {
      forkId = 0;
    } else if (isWithForkId(body)) {
      forkId = body.forkId;
    } else if (isWithRevision(body)) {
      forkId = body.revision.forkId;
      committedOnly = body.revision.includeUncommitted === false;
    } else {
      const _: never = body;
      throw new Error(`Unable to determine forkId for message=${WorldStateMessageType[messageType]}`);
    }

    // Get the queue or create a new one
    let requestQueue = this.queues.get(forkId);
    if (requestQueue === undefined) {
      requestQueue = new WorldStateOpsQueue();
      this.queues.set(forkId, requestQueue);
    }

    // Enqueue the request and wait for the response. The per-fork queue is cleaned up in `finally` even on
    // error, so the JS-side queues map cannot outlive the native fork (e.g. when the native fork was already
    // destroyed by an unwind/historical-prune and DELETE_FORK rejects with "Fork not found").
    let shouldDeleteForkQueue = false;
    try {
      const response = await requestQueue.execute(
        async () => {
          assert.notEqual(messageType, WorldStateMessageType.CLOSE, 'Use close() to close the native instance');
          assert.equal(this.open, true, 'Native instance is closed');
          let response: WorldStateResponse[T];
          try {
            response = await this._sendMessage(messageType, body);
          } catch (error: any) {
            errorHandler(error.message);
            throw error;
          }
          return responseHandler(response);
        },
        messageType,
        committedOnly,
      );
      return response;
    } catch (err: any) {
      shouldDeleteForkQueue = forkId !== 0 && err?.message === 'Fork not found';
      throw err;
    } finally {
      if (messageType === WorldStateMessageType.DELETE_FORK || shouldDeleteForkQueue) {
        await requestQueue.stop();
        this.queues.delete(forkId);
      }
    }
  }

  /**
   * Stops the native instance.
   */
  public async close(): Promise<void> {
    if (!this.open) {
      return;
    }
    this.open = false;
    const queue = this.queues.get(0)!;

    await queue.execute(
      async () => {
        await this._sendMessage(WorldStateMessageType.CLOSE, { canonical: true });
      },
      WorldStateMessageType.CLOSE,
      false,
    );
    await queue.stop();
  }

  private async _sendMessage<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
  ): Promise<WorldStateResponse[T]> {
    let logMetadata: Record<string, any> = {};

    if (body) {
      if ('treeId' in body) {
        logMetadata['treeId'] = MerkleTreeId[body.treeId];
      }

      if ('revision' in body) {
        logMetadata = { ...logMetadata, ...body.revision };
      }

      if ('forkId' in body) {
        logMetadata['forkId'] = body.forkId;
      }

      if ('blockNumber' in body) {
        logMetadata['blockNumber'] = body.blockNumber;
      }

      if ('toBlockNumber' in body) {
        logMetadata['toBlockNumber'] = body.toBlockNumber;
      }

      if ('leafIndex' in body) {
        logMetadata['leafIndex'] = body.leafIndex;
      }

      if ('blockHeaderHash' in body) {
        logMetadata['blockHeaderHash'] = '0x' + body.blockHeaderHash.toString('hex');
      }

      if ('leaves' in body) {
        logMetadata['leavesCount'] = body.leaves.length;
      }

      // sync operation
      if ('paddedNoteHashes' in body) {
        logMetadata['notesCount'] = body.paddedNoteHashes.length;
        logMetadata['nullifiersCount'] = body.paddedNullifiers.length;
        logMetadata['l1ToL2MessagesCount'] = body.paddedL1ToL2Messages.length;
        logMetadata['publicDataWritesCount'] = body.publicDataWrites.length;
      }
    }

    try {
      const { duration, response } = await this.instance.sendMessage(messageType, body);
      this.log.trace(`Call ${WorldStateMessageType[messageType]} took (ms)`, {
        duration,
        ...logMetadata,
      });

      this.instrumentation.recordRoundTrip(duration.totalUs, messageType);
      return response;
    } catch (error) {
      this.log.error(`Call ${WorldStateMessageType[messageType]} failed: ${error}`, error, logMetadata);
      throw error;
    }
  }
=======
  close(): Promise<void>;
>>>>>>> origin/public-next
}
