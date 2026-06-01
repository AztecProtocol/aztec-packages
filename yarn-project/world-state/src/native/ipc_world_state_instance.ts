import { AsyncApi } from '@aztec/bb.js/aztec-wsdb';
import type {
  WorldStateDBStats as WsdbDBStats,
  DBStats as WsdbDBStatsInner,
  WorldStateMeta as WsdbMeta,
  SiblingPathAndIndex as WsdbSiblingPathAndIndex,
  WorldStateStatusFull as WsdbStatusFull,
  WorldStateStatusSummary as WsdbStatusSummary,
  TreeDBStats as WsdbTreeDBStats,
  TreeMeta as WsdbTreeMeta,
} from '@aztec/bb.js/aztec-wsdb';
import {
  ARCHIVE_HEIGHT,
  DomainSeparator,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { GenesisData, WorldStateRevision } from '@aztec/stdlib/world-state';

import assert from 'assert';
import { Decoder } from 'msgpackr';

import type { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import {
  type DBStats,
  type SerializedLeafValue,
  type TreeDBStats,
  type TreeMeta,
  type WorldStateDBStats,
  WorldStateMessageType,
  type WorldStateMeta,
  type WorldStateRequest,
  type WorldStateRequestCategories,
  type WorldStateResponse,
  type WorldStateStatusFull,
  type WorldStateStatusSummary,
  isWithCanonical,
  isWithForkId,
  isWithRevision,
} from './message.js';
import type { NativeWorldStateInstance } from './native_world_state_instance.js';
import { WorldStateOpsQueue } from './world_state_ops_queue.js';

// ————— Msgpack helpers —————

const msgpackDecoder = new Decoder({ useRecords: false });

// ————— Request conversion helpers —————

function toWsdbRevision(rev: WorldStateRevision): { forkId: number; blockNumber: number; includeUncommitted: boolean } {
  return {
    forkId: rev.forkId,
    blockNumber: Number(rev.blockNumber),
    includeUncommitted: rev.includeUncommitted,
  };
}

function blockStateRefToMap(ref: Map<number, readonly [Buffer, number | bigint]>) {
  return [...ref.entries()].map(([treeId, [root, size]]) => ({
    treeId,
    root: new Uint8Array(root),
    size: Number(size),
  }));
}

function toPublicDataLeaf(leaf: SerializedLeafValue): { slot: Uint8Array; value: Uint8Array } {
  if (leaf instanceof Buffer || !('slot' in leaf)) {
    throw new Error('Expected public data leaf');
  }
  return { slot: new Uint8Array(leaf.slot), value: new Uint8Array(leaf.value) };
}

function toNullifierLeaf(leaf: SerializedLeafValue): { nullifier: Uint8Array } {
  if (leaf instanceof Buffer || !('nullifier' in leaf)) {
    throw new Error('Expected nullifier leaf');
  }
  return { nullifier: new Uint8Array(leaf.nullifier) };
}

function fromPublicDataLeaf(leaf: { slot: Uint8Array; value: Uint8Array }): Exclude<SerializedLeafValue, Buffer> {
  return { slot: Buffer.from(leaf.slot), value: Buffer.from(leaf.value) };
}

function fromNullifierLeaf(leaf: { nullifier: Uint8Array }): Exclude<SerializedLeafValue, Buffer> {
  return { nullifier: Buffer.from(leaf.nullifier) };
}

type WireIndexedLeaf<TLeaf> = { leaf: TLeaf; nextIndex: number; nextKey: Uint8Array };
type WireLeafUpdateWitnessData<TLeaf> = { leaf: WireIndexedLeaf<TLeaf>; index: number; path: Uint8Array[] };

function fromIndexedLeaf<TLeaf>(
  leaf: WireIndexedLeaf<TLeaf>,
  convertLeaf: (leaf: TLeaf) => Exclude<SerializedLeafValue, Buffer>,
) {
  return {
    leaf: convertLeaf(leaf.leaf),
    nextIndex: leaf.nextIndex,
    nextKey: Buffer.from(leaf.nextKey),
  };
}

function fromLeafUpdateWitnessData<TLeaf>(
  data: WireLeafUpdateWitnessData<TLeaf>,
  convertLeaf: (leaf: TLeaf) => Exclude<SerializedLeafValue, Buffer>,
) {
  return {
    leaf: fromIndexedLeaf(data.leaf, convertLeaf),
    index: data.index,
    path: data.path.map(p => Buffer.from(p)),
  };
}

function fromBatchInsertionResult<
  TLeaf,
  TResult extends {
    lowLeafWitnessData: Array<WireLeafUpdateWitnessData<TLeaf>>;
    sortedLeaves: Array<{ leaf: TLeaf; index: number }>;
    subtreePath: Uint8Array[];
  },
>(result: TResult, convertLeaf: (leaf: TLeaf) => Exclude<SerializedLeafValue, Buffer>) {
  return {
    lowLeafWitnessData: result.lowLeafWitnessData.map(data => fromLeafUpdateWitnessData(data, convertLeaf)),
    sortedLeaves: result.sortedLeaves.map(({ leaf, index }) => [convertLeaf(leaf), index] as const),
    subtreePath: result.subtreePath.map(p => Buffer.from(p)),
  };
}

function fromSequentialInsertionResult<
  TLeaf,
  TResult extends {
    lowLeafWitnessData: Array<WireLeafUpdateWitnessData<TLeaf>>;
    insertionWitnessData: Array<WireLeafUpdateWitnessData<TLeaf>>;
  },
>(result: TResult, convertLeaf: (leaf: TLeaf) => Exclude<SerializedLeafValue, Buffer>) {
  return {
    lowLeafWitnessData: result.lowLeafWitnessData.map(data => fromLeafUpdateWitnessData(data, convertLeaf)),
    insertionWitnessData: result.insertionWitnessData.map(data => fromLeafUpdateWitnessData(data, convertLeaf)),
  };
}

function toFrLeaf(leaf: SerializedLeafValue): Uint8Array {
  if (!(leaf instanceof Buffer)) {
    throw new Error('Expected field leaf');
  }
  return new Uint8Array(leaf);
}

// ————— Response conversion helpers —————

/** Convert Uint8Array fields to Buffer recursively (for opaque blob responses). */
function convertUint8ArraysToBuffers(obj: unknown): unknown {
  if (obj instanceof Uint8Array) {
    return Buffer.from(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(convertUint8ArraysToBuffers);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertUint8ArraysToBuffers(value);
    }
    return result;
  }
  return obj;
}

/** Decode a msgpack-encoded leaf value blob and convert Uint8Arrays to Buffers. */
function decodeLeafValue(encoded: Uint8Array): SerializedLeafValue {
  const decoded = msgpackDecoder.unpack(Buffer.from(encoded));
  return convertUint8ArraysToBuffers(decoded) as SerializedLeafValue;
}

/** Convert Wsdb state reference (Record<number, [Uint8Array, number]>) to NAPI format. */
function convertStateRef(
  state: Array<{ treeId: number; root: Uint8Array; size: number }>,
): Record<number, readonly [Buffer, number | bigint]> {
  const result: Record<number, readonly [Buffer, number | bigint]> = {};
  for (const { treeId, root, size } of state) {
    result[treeId] = [Buffer.from(root), BigInt(size)] as const;
  }
  return result;
}

/** Convert Wsdb WorldStateStatusSummary to the native world-state format. */
function convertStatusSummary(s: WsdbStatusSummary): WorldStateStatusSummary {
  return {
    unfinalizedBlockNumber: s.unfinalizedBlockNumber,
    finalizedBlockNumber: s.finalizedBlockNumber,
    oldestHistoricalBlock: s.oldestHistoricalBlock,
    treesAreSynched: s.treesAreSynched,
  } as unknown as WorldStateStatusSummary;
}

function convertDBStats(s: WsdbDBStatsInner): DBStats {
  return {
    name: s.name,
    numDataItems: s.numDataItems,
    totalUsedSize: s.totalUsedSize,
  } as unknown as DBStats;
}

function convertTreeDBStats(s: WsdbTreeDBStats): TreeDBStats {
  return {
    mapSize: s.mapSize,
    physicalFileSize: s.physicalFileSize,
    blocksDBStats: convertDBStats(s.blocksDBStats),
    nodesDBStats: convertDBStats(s.nodesDBStats),
    leafPreimagesDBStats: convertDBStats(s.leafPreimagesDBStats),
    leafIndicesDBStats: convertDBStats(s.leafIndicesDBStats),
    blockIndicesDBStats: convertDBStats(s.blockIndicesDBStats),
  } as unknown as TreeDBStats;
}

function convertWorldStateDBStats(s: WsdbDBStats): WorldStateDBStats {
  return {
    noteHashTreeStats: convertTreeDBStats(s.noteHashTreeStats),
    messageTreeStats: convertTreeDBStats(s.messageTreeStats),
    archiveTreeStats: convertTreeDBStats(s.archiveTreeStats),
    publicDataTreeStats: convertTreeDBStats(s.publicDataTreeStats),
    nullifierTreeStats: convertTreeDBStats(s.nullifierTreeStats),
  } as unknown as WorldStateDBStats;
}

function convertTreeMeta(m: WsdbTreeMeta): TreeMeta {
  return {
    name: m.name,
    depth: m.depth,
    size: m.size,
    committedSize: m.committedSize,
    root: m.root,
    initialSize: m.initialSize,
    initialRoot: m.initialRoot,
    oldestHistoricBlock: m.oldestHistoricBlock,
    unfinalizedBlockHeight: m.unfinalizedBlockHeight,
    finalizedBlockHeight: m.finalizedBlockHeight,
  } as unknown as TreeMeta;
}

function convertWorldStateMeta(m: WsdbMeta): WorldStateMeta {
  return {
    noteHashTreeMeta: convertTreeMeta(m.noteHashTreeMeta),
    messageTreeMeta: convertTreeMeta(m.messageTreeMeta),
    archiveTreeMeta: convertTreeMeta(m.archiveTreeMeta),
    publicDataTreeMeta: convertTreeMeta(m.publicDataTreeMeta),
    nullifierTreeMeta: convertTreeMeta(m.nullifierTreeMeta),
  } as unknown as WorldStateMeta;
}

function convertStatusFull(s: WsdbStatusFull): WorldStateStatusFull {
  return {
    summary: convertStatusSummary(s.summary),
    dbStats: convertWorldStateDBStats(s.dbStats),
    meta: convertWorldStateMeta(s.meta),
  } as unknown as WorldStateStatusFull;
}

/** Convert Wsdb SiblingPathAndIndex to NAPI format. */
function convertSiblingPathAndIndex(
  s: WsdbSiblingPathAndIndex | null | undefined,
): { index: bigint; path: Buffer[] } | undefined {
  if (!s) {
    return undefined;
  }
  return {
    index: BigInt(s.index),
    path: s.path.map(p => Buffer.from(p)),
  };
}

// ————— Public API —————

/** Backend interface matching WsdbBackend from bb.js. */
export interface WsdbIpcBackend {
  call(inputBuffer: Uint8Array): Promise<Uint8Array>;
  getSocketPath(): string;
  destroy?(): Promise<void>;
}

/**
 * IPC-backed world state instance.
 * Uses WsdbBackend (spawns aztec-wsdb binary) and the generated AsyncApi
 * to communicate via the NamedUnion IPC protocol.
 */
export class IpcWorldState implements NativeWorldStateInstance {
  private open = true;
  private queues = new Map<number, WorldStateOpsQueue>();
  private api: AsyncApi;
  /** Tracks checkpoint depth per fork (WSDB IPC doesn't return depth in response). */
  private checkpointDepths = new Map<number, number>();

  constructor(
    private readonly wsdbBackend: WsdbIpcBackend,
    private readonly instrumentation: WorldStateInstrumentation,
    bindings?: LoggerBindings,
    private readonly log: Logger = createLogger('world-state:ipc-database', bindings),
  ) {
    this.api = new AsyncApi(wsdbBackend as any);
    this.queues.set(0, new WorldStateOpsQueue());
    this.log.info('Created IPC-backed world state instance');
  }

  /**
   * Spawn an `aztec-wsdb` subprocess and return an IPC-backed world state wrapping it.
   * Encapsulates the bb.js binary discovery, WsdbBackend construction, and readiness wait.
   */
  static async spawn(
    dataDir: string,
    wsTreeMapSizes: WorldStateTreeMapSizes,
    genesis: GenesisData,
    instrumentation: WorldStateInstrumentation,
    bindings?: LoggerBindings,
  ): Promise<IpcWorldState> {
    const { WsdbBackend } = await import('@aztec/bb.js/aztec-wsdb');
    const { findWsdbBinary } = await import('@aztec/bb.js/platform');
    const wsdbBinaryPath = findWsdbBinary();
    if (!wsdbBinaryPath) {
      throw new Error('aztec-wsdb binary not found');
    }
    const wsdbOpts = getWsdbOptions(dataDir, wsTreeMapSizes);
    const prefilledPublicData = genesis.prefilledPublicData.map(
      d => [d.slot.toBuffer(), d.value.toBuffer()] as [Buffer, Buffer],
    );
    const backend = new WsdbBackend({
      binaryPath: wsdbBinaryPath,
      dataDir,
      ...wsdbOpts,
      prefilledPublicData,
      genesisTimestamp: Number(genesis.genesisTimestamp),
    });
    await backend.waitUntilReady();
    return new IpcWorldState(backend, instrumentation, bindings);
  }

  /** Returns the socket path of the underlying wsdb server. */
  getSocketPath(): string {
    return this.wsdbBackend.getSocketPath();
  }

  async call<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
    responseHandler = (response: WorldStateResponse[T]): WorldStateResponse[T] => response,
    errorHandler = (_: string) => {},
  ): Promise<WorldStateResponse[T]> {
    let forkId = -1;
    let committedOnly = false;

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

    let requestQueue = this.queues.get(forkId);
    if (requestQueue === undefined) {
      requestQueue = new WorldStateOpsQueue();
      this.queues.set(forkId, requestQueue);
    }

    const response = await requestQueue.execute(
      async () => {
        assert.notEqual(messageType, WorldStateMessageType.CLOSE, 'Use close() to close the IPC instance');
        assert.equal(this.open, true, 'IPC instance is closed');
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

    if (messageType === WorldStateMessageType.DELETE_FORK) {
      await requestQueue.stop();
      this.queues.delete(forkId);
    }
    return response;
  }

  async close(): Promise<void> {
    if (!this.open) {
      return;
    }
    this.open = false;
    const queue = this.queues.get(0)!;

    // Send shutdown command. Under normal operation, the WSDB process sends its
    // response before exiting (via ShutdownRequested in ipc_server.hpp). The
    // try/catch is defensive: if the process is killed externally (SIGKILL, OOM)
    // before responding, the pending IPC callback would be rejected by the socket
    // close handler. We proceed to destroy the backend regardless.
    try {
      await queue.execute(
        async () => {
          await this.api.wsdbShutdown({});
        },
        WorldStateMessageType.CLOSE,
        false,
      );
    } catch (err: any) {
      this.log.debug(`wsdbShutdown completed with error: ${err.message}`);
    }
    await queue.stop();

    if (this.wsdbBackend.destroy) {
      await this.wsdbBackend.destroy();
    }
  }

  private async _sendMessage<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
  ): Promise<WorldStateResponse[T]> {
    const start = performance.now();
    try {
      const response = await this.dispatch(messageType, body);
      const durationMs = performance.now() - start;
      this.log.trace(`Call ${WorldStateMessageType[messageType]} took (ms)`, { duration: durationMs });
      this.instrumentation.recordRoundTrip(durationMs * 1000, messageType);
      return response;
    } catch (error) {
      this.log.error(`Call ${WorldStateMessageType[messageType]} failed: ${error}`, error);
      throw error;
    }
  }

  private async dispatch<T extends WorldStateMessageType>(
    messageType: T,
    body: WorldStateRequest[T] & WorldStateRequestCategories,
  ): Promise<WorldStateResponse[T]> {
    switch (messageType) {
      // ——— Tree info & state reference ———

      case WorldStateMessageType.GET_TREE_INFO: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_TREE_INFO];
        const resp = await this.api.wsdbGetTreeInfo({
          treeId: b.treeId,
          revision: toWsdbRevision(b.revision),
        });
        return {
          treeId: resp.treeId,
          root: Buffer.from(resp.root),
          size: resp.size,
          depth: resp.depth,
        } as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_STATE_REFERENCE: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_STATE_REFERENCE];
        const resp = await this.api.wsdbGetStateReference({
          revision: toWsdbRevision(b.revision),
        });
        return { state: convertStateRef(resp.state) } as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_INITIAL_STATE_REFERENCE: {
        const resp = await this.api.wsdbGetInitialStateReference({});
        return { state: convertStateRef(resp.state) } as WorldStateResponse[T];
      }

      // ——— Leaf queries ———

      case WorldStateMessageType.GET_LEAF_VALUE: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_LEAF_VALUE];
        const resp = await this.api.wsdbGetLeafValue({
          treeId: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafIndex: Number(b.leafIndex),
        });
        if (!resp.value) {
          return undefined as WorldStateResponse[T];
        }
        return decodeLeafValue(resp.value) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_LEAF_PREIMAGE: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_LEAF_PREIMAGE];
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.wsdbGetPublicDataLeafPreimage({
                revision: toWsdbRevision(b.revision),
                leafIndex: Number(b.leafIndex),
              })
            : await this.api.wsdbGetNullifierLeafPreimage({
                revision: toWsdbRevision(b.revision),
                leafIndex: Number(b.leafIndex),
              });
        if (!resp.preimage) {
          return undefined as WorldStateResponse[T];
        }
        return convertUint8ArraysToBuffers(resp.preimage) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_SIBLING_PATH: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_SIBLING_PATH];
        const resp = await this.api.wsdbGetSiblingPath({
          treeId: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafIndex: Number(b.leafIndex),
        });
        return resp.path.map(p => Buffer.from(p)) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES];
        const resp = await this.api.wsdbGetBlockNumbersForLeafIndices({
          treeId: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafIndices: b.leafIndices.map(Number),
        });
        return {
          blockNumbers: resp.blockNumbers.map(n => (n != null ? BigInt(n) : undefined)),
        } as WorldStateResponse[T];
      }

      // ——— Find operations ———

      case WorldStateMessageType.FIND_LEAF_INDICES: {
        const b = body as WorldStateRequest[WorldStateMessageType.FIND_LEAF_INDICES];
        const revision = toWsdbRevision(b.revision);
        const startIndex = Number(b.startIndex);
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.wsdbFindPublicDataLeafIndices({
                revision,
                leaves: b.leaves.map(toPublicDataLeaf),
                startIndex,
              })
            : b.treeId === MerkleTreeId.NULLIFIER_TREE
              ? await this.api.wsdbFindNullifierLeafIndices({
                  revision,
                  leaves: b.leaves.map(toNullifierLeaf),
                  startIndex,
                })
              : await this.api.wsdbFindLeafIndices({
                  treeId: b.treeId,
                  revision,
                  leaves: b.leaves.map(toFrLeaf),
                  startIndex,
                });
        return {
          indices: resp.indices.map(n => (n != null ? BigInt(n) : undefined)),
        } as WorldStateResponse[T];
      }

      case WorldStateMessageType.FIND_LOW_LEAF: {
        const b = body as WorldStateRequest[WorldStateMessageType.FIND_LOW_LEAF];
        const resp = await this.api.wsdbFindLowLeaf({
          treeId: b.treeId,
          revision: toWsdbRevision(b.revision),
          key: new Uint8Array(b.key.toBuffer()),
        });
        return {
          alreadyPresent: resp.alreadyPresent,
          index: BigInt(resp.index),
        } as WorldStateResponse[T];
      }

      case WorldStateMessageType.FIND_SIBLING_PATHS: {
        const b = body as WorldStateRequest[WorldStateMessageType.FIND_SIBLING_PATHS];
        const revision = toWsdbRevision(b.revision);
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.wsdbFindPublicDataSiblingPaths({
                revision,
                leaves: b.leaves.map(toPublicDataLeaf),
              })
            : b.treeId === MerkleTreeId.NULLIFIER_TREE
              ? await this.api.wsdbFindNullifierSiblingPaths({
                  revision,
                  leaves: b.leaves.map(toNullifierLeaf),
                })
              : await this.api.wsdbFindSiblingPaths({
                  treeId: b.treeId,
                  revision,
                  leaves: b.leaves.map(toFrLeaf),
                });
        return {
          paths: resp.paths.map(convertSiblingPathAndIndex),
        } as WorldStateResponse[T];
      }

      // ——— Mutations ———

      case WorldStateMessageType.APPEND_LEAVES: {
        const b = body as WorldStateRequest[WorldStateMessageType.APPEND_LEAVES];
        if (b.treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
          await this.api.wsdbAppendPublicDataLeaves({ leaves: b.leaves.map(toPublicDataLeaf), forkId: b.forkId });
        } else if (b.treeId === MerkleTreeId.NULLIFIER_TREE) {
          await this.api.wsdbAppendNullifierLeaves({ leaves: b.leaves.map(toNullifierLeaf), forkId: b.forkId });
        } else {
          await this.api.wsdbAppendLeaves({ treeId: b.treeId, leaves: b.leaves.map(toFrLeaf), forkId: b.forkId });
        }
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.BATCH_INSERT: {
        const b = body as WorldStateRequest[WorldStateMessageType.BATCH_INSERT];
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.wsdbBatchInsertPublicData({
                leaves: b.leaves.map(toPublicDataLeaf),
                subtreeDepth: b.subtreeDepth,
                forkId: b.forkId,
              })
            : await this.api.wsdbBatchInsertNullifier({
                leaves: b.leaves.map(toNullifierLeaf),
                subtreeDepth: b.subtreeDepth,
                forkId: b.forkId,
              });
        return (b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? fromBatchInsertionResult(resp.result as any, fromPublicDataLeaf)
          : fromBatchInsertionResult(resp.result as any, fromNullifierLeaf)) as unknown as WorldStateResponse[T];
      }

      case WorldStateMessageType.SEQUENTIAL_INSERT: {
        const b = body as WorldStateRequest[WorldStateMessageType.SEQUENTIAL_INSERT];
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.wsdbSequentialInsertPublicData({
                leaves: b.leaves.map(toPublicDataLeaf),
                forkId: b.forkId,
              })
            : await this.api.wsdbSequentialInsertNullifier({
                leaves: b.leaves.map(toNullifierLeaf),
                forkId: b.forkId,
              });
        return (b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? fromSequentialInsertionResult(resp.result as any, fromPublicDataLeaf)
          : fromSequentialInsertionResult(resp.result as any, fromNullifierLeaf)) as unknown as WorldStateResponse[T];
      }

      case WorldStateMessageType.UPDATE_ARCHIVE: {
        const b = body as WorldStateRequest[WorldStateMessageType.UPDATE_ARCHIVE];
        await this.api.wsdbUpdateArchive({
          blockStateRef: blockStateRefToMap(b.blockStateRef as Map<number, readonly [Buffer, number | bigint]>),
          blockHeaderHash: new Uint8Array(b.blockHeaderHash),
          forkId: b.forkId,
        });
        return undefined as WorldStateResponse[T];
      }

      // ——— Commit / Rollback ———

      case WorldStateMessageType.COMMIT: {
        await this.api.wsdbCommit({});
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.ROLLBACK: {
        await this.api.wsdbRollback({});
        return undefined as WorldStateResponse[T];
      }

      // ——— Block sync ———

      case WorldStateMessageType.SYNC_BLOCK: {
        const b = body as WorldStateRequest[WorldStateMessageType.SYNC_BLOCK];
        const resp = await this.api.wsdbSyncBlock({
          blockNumber: Number(b.blockNumber),
          blockStateRef: blockStateRefToMap(b.blockStateRef as Map<number, readonly [Buffer, number | bigint]>),
          blockHeaderHash: new Uint8Array(b.blockHeaderHash),
          paddedNoteHashes: b.paddedNoteHashes.map(toFrLeaf),
          paddedL1ToL2Messages: b.paddedL1ToL2Messages.map(toFrLeaf),
          paddedNullifiers: b.paddedNullifiers.map(toNullifierLeaf),
          publicDataWrites: b.publicDataWrites.map(toPublicDataLeaf),
        });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      // ——— Fork management ———

      case WorldStateMessageType.CREATE_FORK: {
        const b = body as WorldStateRequest[WorldStateMessageType.CREATE_FORK];
        const resp = await this.api.wsdbCreateFork({
          latest: b.latest,
          blockNumber: Number(b.blockNumber),
        });
        return { forkId: resp.forkId } as WorldStateResponse[T];
      }

      case WorldStateMessageType.DELETE_FORK: {
        const b = body as WorldStateRequest[WorldStateMessageType.DELETE_FORK];
        await this.api.wsdbDeleteFork({ forkId: b.forkId });
        return undefined as WorldStateResponse[T];
      }

      // ——— Block finalization ———

      case WorldStateMessageType.FINALIZE_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.FINALIZE_BLOCKS];
        const resp = await this.api.wsdbFinalizeBlocks({ toBlockNumber: Number(b.toBlockNumber) });
        return convertStatusSummary(resp.status) as WorldStateResponse[T];
      }

      case WorldStateMessageType.UNWIND_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.UNWIND_BLOCKS];
        const resp = await this.api.wsdbUnwindBlocks({ toBlockNumber: Number(b.toBlockNumber) });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      case WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS];
        const resp = await this.api.wsdbRemoveHistoricalBlocks({ toBlockNumber: Number(b.toBlockNumber) });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      // ——— Status ———

      case WorldStateMessageType.GET_STATUS: {
        const resp = await this.api.wsdbGetStatus({});
        return convertStatusSummary(resp.status) as WorldStateResponse[T];
      }

      // ——— Checkpoints ———

      case WorldStateMessageType.CREATE_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.CREATE_CHECKPOINT];
        await this.api.wsdbCreateCheckpoint({ forkId: b.forkId });
        const depth = (this.checkpointDepths.get(b.forkId) ?? 0) + 1;
        this.checkpointDepths.set(b.forkId, depth);
        return { depth } as WorldStateResponse[T];
      }

      case WorldStateMessageType.COMMIT_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.COMMIT_CHECKPOINT];
        await this.api.wsdbCommitCheckpoint({ forkId: b.forkId });
        const depth = Math.max(0, (this.checkpointDepths.get(b.forkId) ?? 0) - 1);
        this.checkpointDepths.set(b.forkId, depth);
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.REVERT_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.REVERT_CHECKPOINT];
        await this.api.wsdbRevertCheckpoint({ forkId: b.forkId });
        const depth = Math.max(0, (this.checkpointDepths.get(b.forkId) ?? 0) - 1);
        this.checkpointDepths.set(b.forkId, depth);
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.COMMIT_ALL_CHECKPOINTS: {
        const b = body as WorldStateRequest[WorldStateMessageType.COMMIT_ALL_CHECKPOINTS];
        const targetDepth = b.depth ?? 0;
        const currentDepth = this.checkpointDepths.get(b.forkId) ?? 0;
        if (targetDepth === 0) {
          // Commit everything — use the bulk operation
          await this.api.wsdbCommitAllCheckpoints({ forkId: b.forkId });
        } else {
          // Commit one level at a time down to target depth
          for (let d = currentDepth; d > targetDepth; d--) {
            await this.api.wsdbCommitCheckpoint({ forkId: b.forkId });
          }
        }
        this.checkpointDepths.set(b.forkId, targetDepth);
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.REVERT_ALL_CHECKPOINTS: {
        const b = body as WorldStateRequest[WorldStateMessageType.REVERT_ALL_CHECKPOINTS];
        const targetDepth = b.depth ?? 0;
        const currentDepth = this.checkpointDepths.get(b.forkId) ?? 0;
        if (targetDepth === 0) {
          // Revert everything — use the bulk operation
          await this.api.wsdbRevertAllCheckpoints({ forkId: b.forkId });
        } else {
          // Revert one level at a time down to target depth
          for (let d = currentDepth; d > targetDepth; d--) {
            await this.api.wsdbRevertCheckpoint({ forkId: b.forkId });
          }
        }
        this.checkpointDepths.set(b.forkId, targetDepth);
        return undefined as WorldStateResponse[T];
      }

      // ——— Misc ———

      case WorldStateMessageType.COPY_STORES: {
        const b = body as WorldStateRequest[WorldStateMessageType.COPY_STORES];
        await this.api.wsdbCopyStores({ dstPath: b.dstPath, compact: b.compact });
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.CLOSE: {
        await this.api.wsdbShutdown({});
        return undefined as WorldStateResponse[T];
      }

      default:
        throw new Error(`Unknown message type: ${messageType}`);
    }
  }
}

/**
 * Helper to create WsdbOptions from standard world state config.
 * Returns the options needed to construct a WsdbBackend.
 */
export function getWsdbOptions(
  dataDir: string,
  wsTreeMapSizes: WorldStateTreeMapSizes,
): {
  treeHeights: Record<number, number>;
  treePrefill: Record<number, number>;
  mapSizes: Record<number, number>;
  initialHeaderGeneratorPoint: number;
} {
  return {
    treeHeights: {
      [MerkleTreeId.NULLIFIER_TREE]: NULLIFIER_TREE_HEIGHT,
      [MerkleTreeId.NOTE_HASH_TREE]: NOTE_HASH_TREE_HEIGHT,
      [MerkleTreeId.PUBLIC_DATA_TREE]: PUBLIC_DATA_TREE_HEIGHT,
      [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: L1_TO_L2_MSG_TREE_HEIGHT,
      [MerkleTreeId.ARCHIVE]: ARCHIVE_HEIGHT,
    },
    treePrefill: {
      [MerkleTreeId.NULLIFIER_TREE]: 2 * MAX_NULLIFIERS_PER_TX,
      [MerkleTreeId.PUBLIC_DATA_TREE]: 2 * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    },
    mapSizes: {
      [MerkleTreeId.NULLIFIER_TREE]: wsTreeMapSizes.nullifierTreeMapSizeKb,
      [MerkleTreeId.NOTE_HASH_TREE]: wsTreeMapSizes.noteHashTreeMapSizeKb,
      [MerkleTreeId.PUBLIC_DATA_TREE]: wsTreeMapSizes.publicDataTreeMapSizeKb,
      [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: wsTreeMapSizes.messageTreeMapSizeKb,
      [MerkleTreeId.ARCHIVE]: wsTreeMapSizes.archiveTreeMapSizeKb,
    },
    initialHeaderGeneratorPoint: DomainSeparator.BLOCK_HEADER_HASH,
  };
}
