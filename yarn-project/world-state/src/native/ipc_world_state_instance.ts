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
import { AsyncApi, WsdbService } from '@aztec/wsdb';
import type {
  WorldStateDBStats as WsdbDBStats,
  DBStats as WsdbDBStatsInner,
  WorldStateMeta as WsdbMeta,
  SiblingPathAndIndex as WsdbSiblingPathAndIndex,
  WorldStateStatusFull as WsdbStatusFull,
  WorldStateStatusSummary as WsdbStatusSummary,
  TreeDBStats as WsdbTreeDBStats,
  TreeMeta as WsdbTreeMeta,
} from '@aztec/wsdb';

import assert from 'assert';
import { cpus } from 'node:os';

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

function formatMap(map: Record<number, number> | undefined): string | undefined {
  if (!map || Object.keys(map).length === 0) {
    return undefined;
  }
  return `{${Object.entries(map)
    .map(([key, value]) => `${key}:${value}`)
    .join(',')}}`;
}

function getWsdbThreadCount(): number {
  return Math.min(16, cpus().length);
}

function getWsdbExtraArgs(
  dataDir: string,
  wsTreeMapSizes: WorldStateTreeMapSizes,
  genesis: GenesisData,
  threads: number,
): string[] {
  const options = getWsdbOptions(dataDir, wsTreeMapSizes);
  const args = ['--data-dir', dataDir, '--threads', threads.toString()];

  const treeHeights = formatMap(options.treeHeights);
  if (treeHeights) {
    args.push('--tree-heights', treeHeights);
  }

  const treePrefill = formatMap(options.treePrefill);
  if (treePrefill) {
    args.push('--tree-prefill', treePrefill);
  }

  const mapSizes = formatMap(options.mapSizes);
  if (mapSizes) {
    args.push('--map-sizes', mapSizes);
  }

  args.push('--initial-header-generator-point', options.initialHeaderGeneratorPoint.toString());

  if (genesis.prefilledPublicData.length > 0) {
    const pairs = genesis.prefilledPublicData.map(data => [
      data.slot.toBuffer().toString('hex'),
      data.value.toBuffer().toString('hex'),
    ]);
    args.push('--prefilled-public-data', JSON.stringify(pairs));
  }

  const genesisTimestamp = Number(genesis.genesisTimestamp);
  if (genesisTimestamp !== 0) {
    args.push('--genesis-timestamp', genesisTimestamp.toString());
  }

  return args;
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

/**
 * IPC-backed world state instance.
 * Uses WsdbService (spawns aztec-wsdb binary) and the generated AsyncApi
 * to communicate via the NamedUnion IPC protocol.
 */
export class IpcWorldState implements NativeWorldStateInstance {
  private open = true;
  private queues = new Map<number, WorldStateOpsQueue>();
  private api: AsyncApi;
  /** Tracks checkpoint depth per fork (WSDB IPC doesn't return depth in response). */
  private checkpointDepths = new Map<number, number>();

  constructor(
    private readonly wsdb: WsdbService,
    private readonly instrumentation: WorldStateInstrumentation,
    bindings?: LoggerBindings,
    private readonly log: Logger = createLogger('world-state:ipc-database', bindings),
  ) {
    this.api = wsdb;
    this.queues.set(0, new WorldStateOpsQueue());
    this.log.info('Created IPC-backed world state instance');
  }

  /**
   * Spawn an `aztec-wsdb` subprocess and return an IPC-backed world state wrapping it.
   * Encapsulates wsdb binary discovery, service construction, and readiness wait.
   */
  static async spawn(
    dataDir: string,
    wsTreeMapSizes: WorldStateTreeMapSizes,
    genesis: GenesisData,
    instrumentation: WorldStateInstrumentation,
    bindings?: LoggerBindings,
  ): Promise<IpcWorldState> {
    const threads = getWsdbThreadCount();
    const wsdb = await WsdbService.spawn({
      transport: 'uds',
      extraArgs: getWsdbExtraArgs(dataDir, wsTreeMapSizes, genesis, threads),
      env: { HARDWARE_CONCURRENCY: threads.toString() },
    });
    return new IpcWorldState(wsdb, instrumentation, bindings);
  }

  /** Returns the socket path of the underlying wsdb server. */
  getSocketPath(): string {
    return this.wsdb.getIpcPath();
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

    try {
      return await requestQueue.execute(
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

    await queue.stop();

    await this.wsdb.destroy();
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
        const resp = await this.api.getTreeInfo({
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
        const resp = await this.api.getStateReference({
          revision: toWsdbRevision(b.revision),
        });
        return { state: convertStateRef(resp.state) } as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_INITIAL_STATE_REFERENCE: {
        const resp = await this.api.getInitialStateReference({});
        return { state: convertStateRef(resp.state) } as WorldStateResponse[T];
      }

      // ——— Leaf queries ———

      case WorldStateMessageType.GET_LEAF_VALUE: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_LEAF_VALUE];
        const revision = toWsdbRevision(b.revision);
        const leafIndex = Number(b.leafIndex);

        if (b.treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
          const resp = await this.api.getPublicDataLeafValue({ revision, leafIndex });
          return (resp.value ? fromPublicDataLeaf(resp.value) : undefined) as WorldStateResponse[T];
        }

        if (b.treeId === MerkleTreeId.NULLIFIER_TREE) {
          const resp = await this.api.getNullifierLeafValue({ revision, leafIndex });
          return (resp.value ? fromNullifierLeaf(resp.value) : undefined) as WorldStateResponse[T];
        }

        const resp = await this.api.getLeafValue({ treeId: b.treeId, revision, leafIndex });
        if (!resp.value) {
          return undefined as WorldStateResponse[T];
        }
        return Buffer.from(resp.value) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_LEAF_PREIMAGE: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_LEAF_PREIMAGE];
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.getPublicDataLeafPreimage({
                revision: toWsdbRevision(b.revision),
                leafIndex: Number(b.leafIndex),
              })
            : await this.api.getNullifierLeafPreimage({
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
        const resp = await this.api.getSiblingPath({
          treeId: b.treeId,
          revision: toWsdbRevision(b.revision),
          leafIndex: Number(b.leafIndex),
        });
        return resp.path.map(p => Buffer.from(p)) as WorldStateResponse[T];
      }

      case WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES: {
        const b = body as WorldStateRequest[WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES];
        const resp = await this.api.getBlockNumbersForLeafIndices({
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
            ? await this.api.findPublicDataLeafIndices({
                revision,
                leaves: b.leaves.map(toPublicDataLeaf),
                startIndex,
              })
            : b.treeId === MerkleTreeId.NULLIFIER_TREE
              ? await this.api.findNullifierLeafIndices({
                  revision,
                  leaves: b.leaves.map(toNullifierLeaf),
                  startIndex,
                })
              : await this.api.findLeafIndices({
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
        const resp = await this.api.findLowLeaf({
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
            ? await this.api.findPublicDataSiblingPaths({
                revision,
                leaves: b.leaves.map(toPublicDataLeaf),
              })
            : b.treeId === MerkleTreeId.NULLIFIER_TREE
              ? await this.api.findNullifierSiblingPaths({
                  revision,
                  leaves: b.leaves.map(toNullifierLeaf),
                })
              : await this.api.findSiblingPaths({
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
          await this.api.appendPublicDataLeaves({ leaves: b.leaves.map(toPublicDataLeaf), forkId: b.forkId });
        } else if (b.treeId === MerkleTreeId.NULLIFIER_TREE) {
          await this.api.appendNullifierLeaves({ leaves: b.leaves.map(toNullifierLeaf), forkId: b.forkId });
        } else {
          await this.api.appendLeaves({ treeId: b.treeId, leaves: b.leaves.map(toFrLeaf), forkId: b.forkId });
        }
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.BATCH_INSERT: {
        const b = body as WorldStateRequest[WorldStateMessageType.BATCH_INSERT];
        const resp =
          b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
            ? await this.api.batchInsertPublicData({
                leaves: b.leaves.map(toPublicDataLeaf),
                subtreeDepth: b.subtreeDepth,
                forkId: b.forkId,
              })
            : await this.api.batchInsertNullifier({
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
            ? await this.api.sequentialInsertPublicData({
                leaves: b.leaves.map(toPublicDataLeaf),
                forkId: b.forkId,
              })
            : await this.api.sequentialInsertNullifier({
                leaves: b.leaves.map(toNullifierLeaf),
                forkId: b.forkId,
              });
        return (b.treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? fromSequentialInsertionResult(resp.result as any, fromPublicDataLeaf)
          : fromSequentialInsertionResult(resp.result as any, fromNullifierLeaf)) as unknown as WorldStateResponse[T];
      }

      case WorldStateMessageType.UPDATE_ARCHIVE: {
        const b = body as WorldStateRequest[WorldStateMessageType.UPDATE_ARCHIVE];
        await this.api.updateArchive({
          blockStateRef: blockStateRefToMap(b.blockStateRef as Map<number, readonly [Buffer, number | bigint]>),
          blockHeaderHash: new Uint8Array(b.blockHeaderHash),
          forkId: b.forkId,
        });
        return undefined as WorldStateResponse[T];
      }

      // ——— Commit / Rollback ———

      case WorldStateMessageType.COMMIT: {
        await this.api.commit({});
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.ROLLBACK: {
        await this.api.rollback({});
        return undefined as WorldStateResponse[T];
      }

      // ——— Block sync ———

      case WorldStateMessageType.SYNC_BLOCK: {
        const b = body as WorldStateRequest[WorldStateMessageType.SYNC_BLOCK];
        const resp = await this.api.syncBlock({
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
        const resp = await this.api.createFork({
          latest: b.latest,
          blockNumber: Number(b.blockNumber),
        });
        return { forkId: resp.forkId } as WorldStateResponse[T];
      }

      case WorldStateMessageType.DELETE_FORK: {
        const b = body as WorldStateRequest[WorldStateMessageType.DELETE_FORK];
        await this.api.deleteFork({ forkId: b.forkId });
        return undefined as WorldStateResponse[T];
      }

      // ——— Block finalization ———

      case WorldStateMessageType.FINALIZE_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.FINALIZE_BLOCKS];
        const resp = await this.api.finalizeBlocks({ toBlockNumber: Number(b.toBlockNumber) });
        return convertStatusSummary(resp.status) as WorldStateResponse[T];
      }

      case WorldStateMessageType.UNWIND_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.UNWIND_BLOCKS];
        const resp = await this.api.unwindBlocks({ toBlockNumber: Number(b.toBlockNumber) });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      case WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS: {
        const b = body as WorldStateRequest[WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS];
        const resp = await this.api.removeHistoricalBlocks({ toBlockNumber: Number(b.toBlockNumber) });
        return convertStatusFull(resp.status) as WorldStateResponse[T];
      }

      // ——— Status ———

      case WorldStateMessageType.GET_STATUS: {
        const resp = await this.api.getStatus({});
        return convertStatusSummary(resp.status) as WorldStateResponse[T];
      }

      // ——— Checkpoints ———

      case WorldStateMessageType.CREATE_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.CREATE_CHECKPOINT];
        await this.api.createCheckpoint({ forkId: b.forkId });
        const depth = (this.checkpointDepths.get(b.forkId) ?? 0) + 1;
        this.checkpointDepths.set(b.forkId, depth);
        return { depth } as WorldStateResponse[T];
      }

      case WorldStateMessageType.COMMIT_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.COMMIT_CHECKPOINT];
        await this.api.commitCheckpoint({ forkId: b.forkId });
        const depth = Math.max(0, (this.checkpointDepths.get(b.forkId) ?? 0) - 1);
        this.checkpointDepths.set(b.forkId, depth);
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.REVERT_CHECKPOINT: {
        const b = body as WorldStateRequest[WorldStateMessageType.REVERT_CHECKPOINT];
        await this.api.revertCheckpoint({ forkId: b.forkId });
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
          await this.api.commitAllCheckpoints({ forkId: b.forkId });
        } else {
          // Commit one level at a time down to target depth
          for (let d = currentDepth; d > targetDepth; d--) {
            await this.api.commitCheckpoint({ forkId: b.forkId });
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
          await this.api.revertAllCheckpoints({ forkId: b.forkId });
        } else {
          // Revert one level at a time down to target depth
          for (let d = currentDepth; d > targetDepth; d--) {
            await this.api.revertCheckpoint({ forkId: b.forkId });
          }
        }
        this.checkpointDepths.set(b.forkId, targetDepth);
        return undefined as WorldStateResponse[T];
      }

      // ——— Misc ———

      case WorldStateMessageType.COPY_STORES: {
        const b = body as WorldStateRequest[WorldStateMessageType.COPY_STORES];
        await this.api.copyStores({ dstPath: b.dstPath, compact: b.compact });
        return undefined as WorldStateResponse[T];
      }

      case WorldStateMessageType.CLOSE: {
        return undefined as WorldStateResponse[T];
      }

      default:
        throw new Error(`Unknown message type: ${messageType}`);
    }
  }
}

/**
 * Helper to create WsdbOptions from standard world state config.
 * Returns the options needed to construct a wsdb service command line.
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
