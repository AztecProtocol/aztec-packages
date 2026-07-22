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
import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { IndexedTreeId, TreeInfo } from '@aztec/stdlib/interfaces/server';
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

import assert from 'node:assert';
import { cpus } from 'node:os';

import type { WorldStateInstrumentation } from '../instrumentation/instrumentation.js';
import type { WorldStateTreeMapSizes } from '../synchronizer/factory.js';
import type {
  BlockStateReference,
  DBStats,
  SerializedBatchInsertionResult,
  SerializedIndexedLeaf,
  SerializedLeafValue,
  SerializedSequentialInsertionResult,
  SerializedSiblingPathAndIndex,
  TreeDBStats,
  TreeMeta,
  TreeStateReference,
  WorldStateDBStats,
  WorldStateMeta,
  WorldStateStatusFull,
  WorldStateStatusSummary,
} from './message.js';
import type { NativeWorldStateInstance } from './native_world_state_instance.js';
import type { WorldStateOperationName } from './world_state_operation.js';

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

/** SHM request/response ring size for the spawned aztec-wsdb process (32 MiB). */
const WSDB_SHM_RING_SIZE = 32 * 1024 * 1024;

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

  // Size the SHM rings generously. Responses such as batch-insertion witnesses
  // run to a few MB, and an SHM frame is capped at half the ring (the wrap
  // handling needs that headroom), so 32 MiB rings give ~16 MiB per message.
  // Ignored by the UDS transport. Pages are demand-faulted, so unused capacity
  // is cheap.
  args.push('--request-ring-size', WSDB_SHM_RING_SIZE.toString());
  args.push('--response-ring-size', WSDB_SHM_RING_SIZE.toString());

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

  // Nullifiers to pre-insert into the genesis nullifier tree (empty by default, so production genesis roots are
  // unchanged). The native indexed nullifier tree requires its prefilled leaves to be unique and strictly
  // increasing, so we enforce that here before handing them to the aztec-wsdb subprocess rather than failing deep
  // inside C++ tree construction. Each nullifier is serialised as a 64-char hex string, matching the JSON-array
  // format `--prefilled-nullifiers` is parsed with in wsdb_ipc_server.cpp.
  const prefilledNullifiers = genesis.prefilledNullifiers ?? [];
  if (prefilledNullifiers.length > 0) {
    for (let i = 1; i < prefilledNullifiers.length; i++) {
      assert(
        prefilledNullifiers[i].toBigInt() > prefilledNullifiers[i - 1].toBigInt(),
        'Prefilled genesis nullifiers must be unique and strictly increasing',
      );
    }
    const hexNullifiers = prefilledNullifiers.map(n => n.toBuffer().toString('hex'));
    args.push('--prefilled-nullifiers', JSON.stringify(hexNullifiers));
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
    threads: number = getWsdbThreadCount(),
  ): Promise<IpcWorldState> {
    const transport = process.env.WSDB_TRANSPORT === 'shm' ? 'shm' : 'uds';
    const wsdb = await WsdbService.spawn({
      transport,
      extraArgs: getWsdbExtraArgs(dataDir, wsTreeMapSizes, genesis, threads),
      env: { HARDWARE_CONCURRENCY: threads.toString() },
    });
    return new IpcWorldState(wsdb, instrumentation, bindings);
  }

  getIpcPath(): string {
    return this.wsdb.getIpcPath();
  }

  async close(): Promise<void> {
    if (!this.open) {
      return;
    }
    this.open = false;
    await this.wsdb.destroy();
  }

  getTreeInfo(treeId: MerkleTreeId, revision: WorldStateRevision): Promise<TreeInfo> {
    return this.execute('getTreeInfo', revision.forkId, revision.includeUncommitted === false, async () => {
      const resp = await this.api.getTreeInfo({ treeId, revision: toWsdbRevision(revision) });
      return {
        treeId: resp.treeId,
        root: Buffer.from(resp.root),
        size: BigInt(resp.size),
        depth: resp.depth,
      };
    });
  }

  getStateReference(revision: WorldStateRevision): Promise<Record<number, TreeStateReference>> {
    return this.execute('getStateReference', revision.forkId, revision.includeUncommitted === false, async () => {
      const resp = await this.api.getStateReference({ revision: toWsdbRevision(revision) });
      return convertStateRef(resp.state);
    });
  }

  getInitialStateReference(): Promise<Record<number, TreeStateReference>> {
    return this.execute('getInitialStateReference', 0, false, async () => {
      const resp = await this.api.getInitialStateReference({});
      return convertStateRef(resp.state);
    });
  }

  getLeafValue(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leafIndex: bigint,
  ): Promise<SerializedLeafValue | undefined> {
    return this.execute('getLeafValue', revision.forkId, revision.includeUncommitted === false, async () => {
      const wsdbRevision = toWsdbRevision(revision);
      const wsdbLeafIndex = Number(leafIndex);

      if (treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
        const resp = await this.api.getPublicDataLeafValue({ revision: wsdbRevision, leafIndex: wsdbLeafIndex });
        return resp.value ? fromPublicDataLeaf(resp.value) : undefined;
      }

      if (treeId === MerkleTreeId.NULLIFIER_TREE) {
        const resp = await this.api.getNullifierLeafValue({ revision: wsdbRevision, leafIndex: wsdbLeafIndex });
        return resp.value ? fromNullifierLeaf(resp.value) : undefined;
      }

      const resp = await this.api.getLeafValue({ treeId, revision: wsdbRevision, leafIndex: wsdbLeafIndex });
      return resp.value ? Buffer.from(resp.value) : undefined;
    });
  }

  getLeafPreimage(
    treeId: IndexedTreeId,
    revision: WorldStateRevision,
    leafIndex: bigint,
  ): Promise<SerializedIndexedLeaf | undefined> {
    return this.execute('getLeafPreimage', revision.forkId, revision.includeUncommitted === false, async () => {
      const resp =
        treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? await this.api.getPublicDataLeafPreimage({
              revision: toWsdbRevision(revision),
              leafIndex: Number(leafIndex),
            })
          : await this.api.getNullifierLeafPreimage({
              revision: toWsdbRevision(revision),
              leafIndex: Number(leafIndex),
            });
      return resp.preimage ? (convertUint8ArraysToBuffers(resp.preimage) as SerializedIndexedLeaf) : undefined;
    });
  }

  getSiblingPath(treeId: MerkleTreeId, revision: WorldStateRevision, leafIndex: bigint): Promise<Buffer[]> {
    return this.execute('getSiblingPath', revision.forkId, revision.includeUncommitted === false, async () => {
      const resp = await this.api.getSiblingPath({
        treeId,
        revision: toWsdbRevision(revision),
        leafIndex: Number(leafIndex),
      });
      return resp.path.map(p => Buffer.from(p));
    });
  }

  getBlockNumbersForLeafIndices(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    return this.execute(
      'getBlockNumbersForLeafIndices',
      revision.forkId,
      revision.includeUncommitted === false,
      async () => {
        const resp = await this.api.getBlockNumbersForLeafIndices({
          treeId,
          revision: toWsdbRevision(revision),
          leafIndices: leafIndices.map(Number),
        });
        return resp.blockNumbers.map(n => (n != null ? BigInt(n) : undefined));
      },
    );
  }

  findLeafIndices(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leaves: SerializedLeafValue[],
    startIndex: bigint,
  ): Promise<(bigint | undefined)[]> {
    return this.execute('findLeafIndices', revision.forkId, revision.includeUncommitted === false, async () => {
      const wsdbRevision = toWsdbRevision(revision);
      const wsdbStartIndex = Number(startIndex);
      const resp =
        treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? await this.api.findPublicDataLeafIndices({
              revision: wsdbRevision,
              leaves: leaves.map(toPublicDataLeaf),
              startIndex: wsdbStartIndex,
            })
          : treeId === MerkleTreeId.NULLIFIER_TREE
            ? await this.api.findNullifierLeafIndices({
                revision: wsdbRevision,
                leaves: leaves.map(toNullifierLeaf),
                startIndex: wsdbStartIndex,
              })
            : await this.api.findLeafIndices({
                treeId,
                revision: wsdbRevision,
                leaves: leaves.map(toFrLeaf),
                startIndex: wsdbStartIndex,
              });
      return resp.indices.map(n => (n != null ? BigInt(n) : undefined));
    });
  }

  findLowLeaf(
    treeId: IndexedTreeId,
    revision: WorldStateRevision,
    key: Fr,
  ): Promise<{ index: bigint; alreadyPresent: boolean }> {
    return this.execute('findLowLeaf', revision.forkId, revision.includeUncommitted === false, async () => {
      const resp = await this.api.findLowLeaf({
        treeId,
        revision: toWsdbRevision(revision),
        key: new Uint8Array(key.toBuffer()),
      });
      return {
        alreadyPresent: resp.alreadyPresent,
        index: BigInt(resp.index),
      };
    });
  }

  findSiblingPaths(
    treeId: MerkleTreeId,
    revision: WorldStateRevision,
    leaves: SerializedLeafValue[],
  ): Promise<(SerializedSiblingPathAndIndex | undefined)[]> {
    return this.execute('findSiblingPaths', revision.forkId, revision.includeUncommitted === false, async () => {
      const wsdbRevision = toWsdbRevision(revision);
      const resp =
        treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? await this.api.findPublicDataSiblingPaths({
              revision: wsdbRevision,
              leaves: leaves.map(toPublicDataLeaf),
            })
          : treeId === MerkleTreeId.NULLIFIER_TREE
            ? await this.api.findNullifierSiblingPaths({
                revision: wsdbRevision,
                leaves: leaves.map(toNullifierLeaf),
              })
            : await this.api.findSiblingPaths({
                treeId,
                revision: wsdbRevision,
                leaves: leaves.map(toFrLeaf),
              });
      return resp.paths.map(convertSiblingPathAndIndex);
    });
  }

  updateArchive(forkId: number, blockStateRef: BlockStateReference, blockHeaderHash: Buffer): Promise<void> {
    return this.execute('updateArchive', forkId, false, async () => {
      await this.api.updateArchive({
        blockStateRef: blockStateRefToMap(blockStateRef),
        blockHeaderHash: new Uint8Array(blockHeaderHash),
        forkId,
      });
    });
  }

  appendLeaves(treeId: MerkleTreeId, forkId: number, leaves: SerializedLeafValue[]): Promise<void> {
    return this.execute('appendLeaves', forkId, false, async () => {
      if (treeId === MerkleTreeId.PUBLIC_DATA_TREE) {
        await this.api.appendPublicDataLeaves({ leaves: leaves.map(toPublicDataLeaf), forkId });
      } else if (treeId === MerkleTreeId.NULLIFIER_TREE) {
        await this.api.appendNullifierLeaves({ leaves: leaves.map(toNullifierLeaf), forkId });
      } else {
        await this.api.appendLeaves({ treeId, leaves: leaves.map(toFrLeaf), forkId });
      }
    });
  }

  batchInsert(
    treeId: IndexedTreeId,
    forkId: number,
    leaves: SerializedLeafValue[],
    subtreeDepth: number,
  ): Promise<SerializedBatchInsertionResult> {
    return this.execute('batchInsert', forkId, false, async () => {
      const resp =
        treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? await this.api.batchInsertPublicData({
              leaves: leaves.map(toPublicDataLeaf),
              subtreeDepth,
              forkId,
            })
          : await this.api.batchInsertNullifier({
              leaves: leaves.map(toNullifierLeaf),
              subtreeDepth,
              forkId,
            });
      return treeId === MerkleTreeId.PUBLIC_DATA_TREE
        ? fromBatchInsertionResult(resp.result as any, fromPublicDataLeaf)
        : fromBatchInsertionResult(resp.result as any, fromNullifierLeaf);
    });
  }

  sequentialInsert(
    treeId: IndexedTreeId,
    forkId: number,
    leaves: SerializedLeafValue[],
  ): Promise<SerializedSequentialInsertionResult> {
    return this.execute('sequentialInsert', forkId, false, async () => {
      const resp =
        treeId === MerkleTreeId.PUBLIC_DATA_TREE
          ? await this.api.sequentialInsertPublicData({
              leaves: leaves.map(toPublicDataLeaf),
              forkId,
            })
          : await this.api.sequentialInsertNullifier({
              leaves: leaves.map(toNullifierLeaf),
              forkId,
            });
      return treeId === MerkleTreeId.PUBLIC_DATA_TREE
        ? fromSequentialInsertionResult(resp.result as any, fromPublicDataLeaf)
        : fromSequentialInsertionResult(resp.result as any, fromNullifierLeaf);
    });
  }

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
  }): Promise<WorldStateStatusFull> {
    return this.execute('syncBlock', 0, false, async () => {
      const resp = await this.api.syncBlock({
        blockNumber: Number(input.blockNumber),
        blockStateRef: blockStateRefToMap(input.blockStateRef),
        blockHeaderHash: new Uint8Array(input.blockHeaderHash),
        expectedArchiveRoot: new Uint8Array(input.expectedArchiveRoot),
        expectedPreviousArchiveRoot: new Uint8Array(input.expectedPreviousArchiveRoot),
        paddedNoteHashes: input.paddedNoteHashes.map(toFrLeaf),
        paddedL1ToL2Messages: input.paddedL1ToL2Messages.map(toFrLeaf),
        paddedNullifiers: input.paddedNullifiers.map(toNullifierLeaf),
        publicDataWrites: input.publicDataWrites.map(toPublicDataLeaf),
      });
      return convertStatusFull(resp.status);
    });
  }

  createFork(input: { latest: boolean; blockNumber: BlockNumber }): Promise<number> {
    return this.execute('createFork', 0, false, async () => {
      const resp = await this.api.createFork({
        latest: input.latest,
        blockNumber: Number(input.blockNumber),
      });
      return resp.forkId;
    });
  }

  deleteFork(forkId: number): Promise<void> {
    return this.execute('deleteFork', forkId, false, async () => {
      await this.api.deleteFork({ forkId });
    });
  }

  finalizeBlocks(toBlockNumber: BlockNumber): Promise<WorldStateStatusSummary> {
    return this.execute('finalizeBlocks', 0, false, async () => {
      const resp = await this.api.finalizeBlocks({ toBlockNumber: Number(toBlockNumber) });
      return convertStatusSummary(resp.status);
    });
  }

  unwindBlocks(toBlockNumber: BlockNumber): Promise<WorldStateStatusFull> {
    return this.execute('unwindBlocks', 0, false, async () => {
      const resp = await this.api.unwindBlocks({ toBlockNumber: Number(toBlockNumber) });
      return convertStatusFull(resp.status);
    });
  }

  removeHistoricalBlocks(toBlockNumber: BlockNumber): Promise<WorldStateStatusFull> {
    return this.execute('removeHistoricalBlocks', 0, false, async () => {
      const resp = await this.api.removeHistoricalBlocks({ toBlockNumber: Number(toBlockNumber) });
      return convertStatusFull(resp.status);
    });
  }

  getStatus(): Promise<WorldStateStatusSummary> {
    return this.execute('getStatus', 0, false, async () => {
      const resp = await this.api.getStatus({});
      return convertStatusSummary(resp.status);
    });
  }

  createCheckpoint(forkId: number): Promise<number> {
    return this.execute('createCheckpoint', forkId, false, async () => {
      await this.api.createCheckpoint({ forkId });
      const depth = (this.checkpointDepths.get(forkId) ?? 0) + 1;
      this.checkpointDepths.set(forkId, depth);
      return depth;
    });
  }

  commitCheckpoint(forkId: number): Promise<void> {
    return this.execute('commitCheckpoint', forkId, false, async () => {
      await this.api.commitCheckpoint({ forkId });
      const depth = Math.max(0, (this.checkpointDepths.get(forkId) ?? 0) - 1);
      this.checkpointDepths.set(forkId, depth);
    });
  }

  revertCheckpoint(forkId: number): Promise<void> {
    return this.execute('revertCheckpoint', forkId, false, async () => {
      await this.api.revertCheckpoint({ forkId });
      const depth = Math.max(0, (this.checkpointDepths.get(forkId) ?? 0) - 1);
      this.checkpointDepths.set(forkId, depth);
    });
  }

  commitAllCheckpoints(forkId: number, depth: number): Promise<void> {
    return this.execute('commitAllCheckpoints', forkId, false, async () => {
      const currentDepth = this.checkpointDepths.get(forkId) ?? 0;
      if (depth === 0) {
        await this.api.commitAllCheckpoints({ forkId });
      } else {
        for (let d = currentDepth; d > depth; d--) {
          await this.api.commitCheckpoint({ forkId });
        }
      }
      this.checkpointDepths.set(forkId, depth);
    });
  }

  revertAllCheckpoints(forkId: number, depth: number): Promise<void> {
    return this.execute('revertAllCheckpoints', forkId, false, async () => {
      const currentDepth = this.checkpointDepths.get(forkId) ?? 0;
      if (depth === 0) {
        await this.api.revertAllCheckpoints({ forkId });
      } else {
        for (let d = currentDepth; d > depth; d--) {
          await this.api.revertCheckpoint({ forkId });
        }
      }
      this.checkpointDepths.set(forkId, depth);
    });
  }

  copyStores(dstPath: string, compact: boolean): Promise<void> {
    return this.execute('copyStores', 0, false, async () => {
      await this.api.copyStores({ dstPath, compact });
    });
  }

  // Read/write ordering is enforced server-side by the wsdb per-fork scheduler,
  // so the client no longer queues: every op is sent immediately and the server
  // serializes writes per fork while running reads concurrently. `_forkId` and
  // `_committedOnly` are retained in the signature (they describe the op) but are
  // no longer needed for client-side ordering.
  private async execute<T>(
    operation: WorldStateOperationName,
    _forkId: number,
    _committedOnly: boolean,
    request: () => Promise<T>,
  ): Promise<T> {
    if (!this.open) {
      throw new Error('IPC instance is closed');
    }
    return await this.send(operation, request);
  }

  private async send<T>(operation: WorldStateOperationName, request: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const response = await request();
      const durationMs = performance.now() - start;
      this.log.trace(`Call ${operation} took (ms)`, { duration: durationMs });
      this.instrumentation.recordRoundTrip(durationMs * 1000, operation);
      return response;
    } catch (error) {
      this.log.error(`Call ${operation} failed: ${error}`, error);
      throw error;
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
