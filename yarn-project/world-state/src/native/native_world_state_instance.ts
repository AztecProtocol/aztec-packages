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

/** Backend-agnostic handle to a running aztec-wsdb world state, accessed by the TS layer. */
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

<<<<<<< HEAD
=======
/**
 * Strongly-typed interface to access the WorldState class in the native world_state_napi module.
 */
export class NativeWorldState implements NativeWorldStateInstance {
  private open = true;

  // We maintain a map of queue to fork
  private queues = new Map<number, WorldStateOpsQueue>();

  private instance: MsgpackChannel<WorldStateMessageType, WorldStateRequest, WorldStateResponse>;

  /** Creates a new native WorldState instance */
  constructor(
    private readonly dataDir: string,
    private readonly wsTreeMapSizes: WorldStateTreeMapSizes,
    private readonly genesis: GenesisData = EMPTY_GENESIS_DATA,
    private readonly instrumentation: WorldStateInstrumentation,
    bindings?: LoggerBindings,
    private readonly log: Logger = createLogger('world-state:database', bindings),
    private readonly ephemeral: boolean = false,
  ) {
    const threads = Math.min(cpus().length, MAX_WORLD_STATE_THREADS);
    log.info(
      `Creating world state data store at directory ${dataDir} with map sizes ${JSON.stringify(
        wsTreeMapSizes,
      )} and ${threads} threads (ephemeral=${ephemeral}).`,
    );
    const prefilledPublicDataBufferArray = genesis.prefilledPublicData.map(d => [
      d.slot.toBuffer(),
      d.value.toBuffer(),
    ]);
    // Nullifiers to pre-insert into the genesis nullifier tree (empty by default, so production genesis roots are
    // unchanged). The native indexed nullifier tree requires its prefilled leaves to be unique and strictly
    // increasing, so we enforce that here before handing them over rather than failing deep inside the C++ tree
    // construction.
    const prefilledNullifiers = genesis.prefilledNullifiers ?? [];
    for (let i = 1; i < prefilledNullifiers.length; i++) {
      assert(
        prefilledNullifiers[i].toBigInt() > prefilledNullifiers[i - 1].toBigInt(),
        'Prefilled genesis nullifiers must be unique and strictly increasing',
      );
    }
    const prefilledNullifiersBufferArray = prefilledNullifiers.map(n => n.toBuffer());
    const ws = new BaseNativeWorldState(
      dataDir,
      {
        [MerkleTreeId.NULLIFIER_TREE]: NULLIFIER_TREE_HEIGHT,
        [MerkleTreeId.NOTE_HASH_TREE]: NOTE_HASH_TREE_HEIGHT,
        [MerkleTreeId.PUBLIC_DATA_TREE]: PUBLIC_DATA_TREE_HEIGHT,
        [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: L1_TO_L2_MSG_TREE_HEIGHT,
        [MerkleTreeId.ARCHIVE]: ARCHIVE_HEIGHT,
      },
      {
        [MerkleTreeId.NULLIFIER_TREE]: 2 * MAX_NULLIFIERS_PER_TX,
        [MerkleTreeId.PUBLIC_DATA_TREE]: 2 * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      },
      prefilledPublicDataBufferArray,
      prefilledNullifiersBufferArray,
      DomainSeparator.BLOCK_HEADER_HASH,
      Number(genesis.genesisTimestamp),
      {
        [MerkleTreeId.NULLIFIER_TREE]: wsTreeMapSizes.nullifierTreeMapSizeKb,
        [MerkleTreeId.NOTE_HASH_TREE]: wsTreeMapSizes.noteHashTreeMapSizeKb,
        [MerkleTreeId.PUBLIC_DATA_TREE]: wsTreeMapSizes.publicDataTreeMapSizeKb,
        [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: wsTreeMapSizes.messageTreeMapSizeKb,
        [MerkleTreeId.ARCHIVE]: wsTreeMapSizes.archiveTreeMapSizeKb,
      },
      threads,
      ephemeral,
    );
    this.instance = new MsgpackChannel(ws);
    // Manually create the queue for the canonical fork
    this.queues.set(0, new WorldStateOpsQueue());
  }

  public getDataDir() {
    return this.dataDir;
  }

  public clone() {
    return new NativeWorldState(
      this.dataDir,
      this.wsTreeMapSizes,
      this.genesis,
      this.instrumentation,
      this.log.getBindings(),
      this.log,
      this.ephemeral,
    );
  }

  /**
   * Gets the native WorldState handle from the underlying native instance.
   * We call the getHandle() method on the native WorldState to get a NAPI External
   * that wraps the underlying C++ WorldState pointer.
   * @returns The NAPI External handle to the native WorldState instance,since
   * the NAPI external type is opaque, we return any (we could also use an opaque symbol type)
   */
  public getHandle(): any {
    const worldStateWrapper = (this.instance as any).dest;

    if (!worldStateWrapper) {
      throw new Error('No WorldStateWrapper found');
    }

    if (typeof worldStateWrapper.getHandle !== 'function') {
      throw new Error('WorldStateWrapper does not have getHandle method');
    }

    // Call getHandle() to get the NAPI External
    try {
      return worldStateWrapper.getHandle();
    } catch (error) {
      this.log.error('Failed to get native WorldState handle', error);
    }
  }

>>>>>>> origin/v5-next
  /**
   * IPC path the underlying aztec-wsdb process listens on. The C++ AVM uses this to attach to the
   * same world state instance the TS layer is using.
   */
  getIpcPath(): string;

<<<<<<< HEAD
=======
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

>>>>>>> origin/v5-next
  /**
   * Shut down the world state instance. Cancels any in-flight queues, closes the IPC channel, and
   * terminates the underlying aztec-wsdb process. Idempotent.
   */
  close(): Promise<void>;
}
