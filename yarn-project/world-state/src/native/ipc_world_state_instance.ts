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
import type { WorldStateRevision } from '@aztec/stdlib/world-state';

import assert from 'assert';
import { Decoder, Encoder } from 'msgpackr';

import type { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import {
  type DBStats,
  type SerializedIndexedLeaf,
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

const msgpackEncoder = new Encoder({ useRecords: false });
const msgpackDecoder = new Decoder({ useRecords: false });

/** Msgpack-encode a SerializedLeafValue into bytes for IPC transport. */
function serializeLeafToBytes(leaf: SerializedLeafValue): Uint8Array {
  return Buffer.from(msgpackEncoder.pack(leaf));
}

// ————— Request conversion helpers —————

function toWsdbRevision(rev: WorldStateRevision): { forkid: number; blocknumber: number; includeuncommitted: boolean } {
  return {
    forkid: rev.forkId,
    blocknumber: Number(rev.blockNumber),
    includeuncommitted: rev.includeUncommitted,
  };
}

function blockStateRefToMap(ref: Map<number, readonly [Buffer, number | bigint]>): Map<number, [Uint8Array, number]> {
  const result = new Map<number, [Uint8Array, number]>();
  for (const [treeId, [root, size]] of ref.entries()) {
    result.set(treeId, [new Uint8Array(root), Number(size)]);
  }
  return result;
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

/** Decode a msgpack-encoded indexed leaf preimage blob. */
function decodeLeafPreimage(encoded: Uint8Array): SerializedIndexedLeaf {
  const decoded = msgpackDecoder.unpack(Buffer.from(encoded));
  return convertUint8ArraysToBuffers(decoded) as SerializedIndexedLeaf;
}

/** Convert Wsdb state reference (Record<number, [Uint8Array, number]>) to NAPI format. */
function convertStateRef(
  state: Record<number, [Uint8Array, number]>,
): Record<number, readonly [Buffer, number | bigint]> {
  const result: Record<number, readonly [Buffer, number | bigint]> = {};
  for (const [key, [root, size]] of Object.entries(state)) {
    result[Number(key)] = [Buffer.from(root), BigInt(size)] as const;
  }
  return result;
}

/** Convert Wsdb WorldStateStatusSummary (lowercase) to NAPI format (camelCase). */
function convertStatusSummary(s: WsdbStatusSummary): WorldStateStatusSummary {
  return {
    unfinalizedBlockNumber: s.unfinalizedblocknumber,
    finalizedBlockNumber: s.finalizedblocknumber,
    oldestHistoricalBlock: s.oldesthistoricalblock,
    treesAreSynched: s.treesaresynched,
  } as unknown as WorldStateStatusSummary;
}

function convertDBStats(s: WsdbDBStatsInner): DBStats {
  return {
    name: s.name,
    numDataItems: s.numdataitems,
    totalUsedSize: s.totalusedsize,
  } as unknown as DBStats;
}

function convertTreeDBStats(s: WsdbTreeDBStats): TreeDBStats {
  return {
    mapSize: s.mapsize,
    physicalFileSize: s.physicalfilesize,
    blocksDBStats: convertDBStats(s.blocksdbstats),
    nodesDBStats: convertDBStats(s.nodesdbstats),
    leafPreimagesDBStats: convertDBStats(s.leafpreimagesdbstats),
    leafIndicesDBStats: convertDBStats(s.leafindicesdbstats),
    blockIndicesDBStats: convertDBStats(s.blockindicesdbstats),
  } as unknown as TreeDBStats;
}

function convertWorldStateDBStats(s: WsdbDBStats): WorldStateDBStats {
  return {
    noteHashTreeStats: convertTreeDBStats(s.notehashtreestats),
    messageTreeStats: convertTreeDBStats(s.messagetreestats),
    archiveTreeStats: convertTreeDBStats(s.archivetreestats),
    publicDataTreeStats: convertTreeDBStats(s.publicdatatreestats),
    nullifierTreeStats: convertTreeDBStats(s.nullifiertreestats),
  } as unknown as WorldStateDBStats;
}

function convertTreeMeta(m: WsdbTreeMeta): TreeMeta {
  return {
    name: m.name,
    depth: m.depth,
    size: m.size,
    committedSize: m.committedsize,
    root: m.root,
    initialSize: m.initialsize,
    initialRoot: m.initialroot,
    oldestHistoricBlock: m.oldesthistoricblock,
    unfinalizedBlockHeight: m.unfinalizedblockheight,
    finalizedBlockHeight: m.finalizedblockheight,
  } as unknown as TreeMeta;
}

function convertWorldStateMeta(m: WsdbMeta): WorldStateMeta {
  return {
    noteHashTreeMeta: convertTreeMeta(m.notehashtreemeta),
    messageTreeMeta: convertTreeMeta(m.messagetreemeta),
    archiveTreeMeta: convertTreeMeta(m.archivetreemeta),
    publicDataTreeMeta: convertTreeMeta(m.publicdatatreemeta),
    nullifierTreeMeta: convertTreeMeta(m.nullifiertreemeta),
  } as unknown as WorldStateMeta;
}

function convertStatusFull(s: WsdbStatusFull): WorldStateStatusFull {
  return {
    summary: convertStatusSummary(s.summary),
    dbStats: convertWorldStateDBStats(s.dbstats),
    meta: convertWorldStateMeta(s.meta),
  } as unknown as WorldStateStatusFull;
}

/** Convert Wsdb SiblingPathAndIndex to NAPI format. */
function convertSiblingPathAndIndex(
  s: WsdbSiblingPathAndIndex | undefined,
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

  /** Returns the socket path of the underlying wsdb server. */
  getSocketPath(): string {
    return this.wsdbBackend.getSocketPath();
  }

  /**
   * Required by `NativeWorldStateInstance` for compatibility with the in-process
   * NAPI path. The IPC backend does not expose an in-process pointer; callers that
   * need to reach the WSDB process must use {@link getSocketPath} instead.
   */
  getHandle(): any {
    throw new Error('IpcWorldState has no in-process handle; use getSocketPath() instead');
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

    // The per-fork queue is cleaned up in `finally` even on error, so the JS-side queues map cannot outlive
    // the native fork (e.g. when the native fork was already destroyed by an unwind/historical-prune and
    // DELETE_FORK rejects with "Fork not found").
    try {
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
      return response;
    } finally {
      if (messageType === WorldStateMessageType.DELETE_FORK) {
        await requestQueue.stop();
        this.queues.delete(forkId);
      }
    }
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
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
        });
        return {
          treeId: resp.treeid,
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
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafindex: Number(b.leafIndex),
        });
        if (!resp.value) {
          return undefined as WorldStateResponse[T];
        }
        return decodeLeafValue(resp.value) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_LEAF_PREIMAGE: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_LEAF_PREIMAGE];
        const resp = await this.api.wsdbGetLeafPreimage({
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafindex: Number(b.leafIndex),
        });
        if (!resp.preimage) {
          return undefined as WorldStateResponse[T];
        }
        return decodeLeafPreimage(resp.preimage) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_SIBLING_PATH: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_SIBLING_PATH];
        const resp = await this.api.wsdbGetSiblingPath({
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafindex: Number(b.leafIndex),
        });
        return resp.path.map(p => Buffer.from(p)) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES];
        const resp = await this.api.wsdbGetBlockNumbersForLeafIndices({
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafindices: b.leafIndices.map(Number),
        });
        return {
          blockNumbers: resp.blocknumbers.map(n => (n != null ? BigInt(n) : undefined)),
        } as WorldStateResponse[T];
      }

      // ——— Find operations ———

      case WorldStateMessageType.FIND_LEAF_INDICES: {
        const b = body as WorldStateRequest[WorldStateMessageType.FIND_LEAF_INDICES];
        const resp = await this.api.wsdbFindLeafIndices({
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          leaves: b.leaves.map(serializeLeafToBytes),
          startindex: Number(b.startIndex),
        });
        return {
          indices: resp.indices.map(n => (n != null ? BigInt(n) : undefined)),
        } as WorldStateResponse[T];
      }

      case WorldStateMessageType.FIND_LOW_LEAF: {
        const b = body as WorldStateRequest[WorldStateMessageType.FIND_LOW_LEAF];
        const resp = await this.api.wsdbFindLowLeaf({
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          key: new Uint8Array(b.key.toBuffer()),
        });
        return {
          alreadyPresent: resp.alreadypresent,
          index: BigInt(resp.index),
        } as WorldStateResponse[T];
      }

      case WorldStateMessageType.FIND_SIBLING_PATHS: {
        const b = body as WorldStateRequest[WorldStateMessageType.FIND_SIBLING_PATHS];
        const resp = await this.api.wsdbFindSiblingPaths({
          treeid: b.treeId,
          revision: toWsdbRevision(b.revision),
          leaves: b.leaves.map(serializeLeafToBytes),
        });
        return {
          paths: resp.paths.map(convertSiblingPathAndIndex),
        } as WorldStateResponse[T];
      }

      // ——— Mutations ———

      case WorldStateMessageType.APPEND_LEAVES: {
        const b = body as WorldStateRequest[WorldStateMessageType.APPEND_LEAVES];
        await this.api.wsdbAppendLeaves({
          treeid: b.treeId,
          leaves: b.leaves.map(serializeLeafToBytes),
          forkid: b.forkId,
        });
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.BATCH_INSERT: {
        const b = body as WorldStateRequest[WorldStateMessageType.BATCH_INSERT];
        const resp = await this.api.wsdbBatchInsert({
          treeid: b.treeId,
          leaves: b.leaves.map(serializeLeafToBytes),
          subtreedepth: b.subtreeDepth,
          forkid: b.forkId,
        });
        const decoded = msgpackDecoder.unpack(Buffer.from(resp.result));
        return convertUint8ArraysToBuffers(decoded) as WorldStateResponse[T];
      }

      case WorldStateMessageType.SEQUENTIAL_INSERT: {
        const b = body as WorldStateRequest[WorldStateMessageType.SEQUENTIAL_INSERT];
        const resp = await this.api.wsdbSequentialInsert({
          treeid: b.treeId,
          leaves: b.leaves.map(serializeLeafToBytes),
          forkid: b.forkId,
        });
        const decoded = msgpackDecoder.unpack(Buffer.from(resp.result));
        return convertUint8ArraysToBuffers(decoded) as WorldStateResponse[T];
      }

      case WorldStateMessageType.UPDATE_ARCHIVE: {
        const b = body as WorldStateRequest[WorldStateMessageType.UPDATE_ARCHIVE];
        await this.api.wsdbUpdateArchive({
          blockstateref: blockStateRefToMap(b.blockStateRef as Map<number, readonly [Buffer, number | bigint]>) as any,
          blockheaderhash: new Uint8Array(b.blockHeaderHash),
          forkid: b.forkId,
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
          blocknumber: Number(b.blockNumber),
          blockstateref: blockStateRefToMap(b.blockStateRef as Map<number, readonly [Buffer, number | bigint]>) as any,
          blockheaderhash: new Uint8Array(b.blockHeaderHash),
          paddednotehashes: b.paddedNoteHashes.map(l => new Uint8Array(l as Buffer)),
          paddedl1tol2messages: b.paddedL1ToL2Messages.map(l => new Uint8Array(l as Buffer)),
          paddednullifiers: b.paddedNullifiers.map(l => ({
            nullifier: new Uint8Array((l as { nullifier: Buffer }).nullifier),
          })),
          publicdatawrites: b.publicDataWrites.map(l => ({
            slot: new Uint8Array((l as { slot: Buffer; value: Buffer }).slot),
            value: new Uint8Array((l as { slot: Buffer; value: Buffer }).value),
          })),
        });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      // ——— Fork management ———

      case WorldStateMessageType.CREATE_FORK: {
        const b = body as WorldStateRequest[WorldStateMessageType.CREATE_FORK];
        const resp = await this.api.wsdbCreateFork({
          latest: b.latest,
          blocknumber: Number(b.blockNumber),
        });
        return { forkId: resp.forkid } as WorldStateResponse[T];
      }

      case WorldStateMessageType.DELETE_FORK: {
        const b = body as WorldStateRequest[WorldStateMessageType.DELETE_FORK];
        await this.api.wsdbDeleteFork({ forkid: b.forkId });
        return undefined as WorldStateResponse[T];
      }

      // ——— Block finalization ———

      case WorldStateMessageType.FINALIZE_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.FINALIZE_BLOCKS];
        const resp = await this.api.wsdbFinalizeBlocks({ toblocknumber: Number(b.toBlockNumber) });
        return convertStatusSummary(resp.status) as WorldStateResponse[T];
      }

      case WorldStateMessageType.UNWIND_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.UNWIND_BLOCKS];
        const resp = await this.api.wsdbUnwindBlocks({ toblocknumber: Number(b.toBlockNumber) });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      case WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS];
        const resp = await this.api.wsdbRemoveHistoricalBlocks({ toblocknumber: Number(b.toBlockNumber) });
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
        await this.api.wsdbCreateCheckpoint({ forkid: b.forkId });
        const depth = (this.checkpointDepths.get(b.forkId) ?? 0) + 1;
        this.checkpointDepths.set(b.forkId, depth);
        return { depth } as WorldStateResponse[T];
      }

      case WorldStateMessageType.COMMIT_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.COMMIT_CHECKPOINT];
        await this.api.wsdbCommitCheckpoint({ forkid: b.forkId });
        const depth = Math.max(0, (this.checkpointDepths.get(b.forkId) ?? 0) - 1);
        this.checkpointDepths.set(b.forkId, depth);
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.REVERT_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.REVERT_CHECKPOINT];
        await this.api.wsdbRevertCheckpoint({ forkid: b.forkId });
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
          await this.api.wsdbCommitAllCheckpoints({ forkid: b.forkId });
        } else {
          // Commit one level at a time down to target depth
          for (let d = currentDepth; d > targetDepth; d--) {
            await this.api.wsdbCommitCheckpoint({ forkid: b.forkId });
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
          await this.api.wsdbRevertAllCheckpoints({ forkid: b.forkId });
        } else {
          // Revert one level at a time down to target depth
          for (let d = currentDepth; d > targetDepth; d--) {
            await this.api.wsdbRevertCheckpoint({ forkid: b.forkId });
          }
        }
        this.checkpointDepths.set(b.forkId, targetDepth);
        return undefined as WorldStateResponse[T];
      }

      // ——— Misc ———

      case WorldStateMessageType.COPY_STORES: {
        const b = body as WorldStateRequest[WorldStateMessageType.COPY_STORES];
        await this.api.wsdbCopyStores({ dstpath: b.dstPath, compact: b.compact });
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
