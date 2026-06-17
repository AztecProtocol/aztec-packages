import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import type { StateReference } from '@aztec/stdlib/tx';

export interface WorldStateStatusSummary {
  /** Last block number that can still be unwound. */
  unfinalizedBlockNumber: BlockNumber;
  /** Last block number that is finalized and cannot be unwound. */
  finalizedBlockNumber: BlockNumber;
  /** Oldest block still available for historical queries and forks. */
  oldestHistoricalBlock: BlockNumber;
  /** Whether the trees are in sync with each other */
  treesAreSynched: boolean;
}

export interface TreeMeta {
  /** The name of the tree */
  name: string;
  /** The depth of the tree */
  depth: number;
  /** The current size of the tree (number of leaves) */
  size: bigint;
  /** The committed size of the tree */
  committedSize: bigint;
  /** The current root of the tree */
  root: Fr;
  /** The tree's initial size */
  initialSize: bigint;
  /** The tree's initial root value  */
  initialRoot: Fr;
  /** The current oldest historical block number of the tree */
  oldestHistoricBlock: BlockNumber;
  /** The current unfinalized block number of the tree */
  unfinalizedBlockHeight: BlockNumber;
  /** The current finalized block number of the tree */
  finalizedBlockHeight: BlockNumber;
}

export interface DBStats {
  /** The name of the DB */
  name: string;
  /** The total number of key/value pairs in the DB */
  numDataItems: bigint;
  /** The current mapped size of the DB */
  totalUsedSize: bigint;
}

export interface TreeDBStats {
  /** The configured max size of the DB mapping file (effectively the max possible size of the DB) */
  mapSize: bigint;
  /** The physical file size of the database on disk */
  physicalFileSize: bigint;
  /** Stats for the 'blocks' DB */
  blocksDBStats: DBStats;
  /** Stats for the 'nodes' DB */
  nodesDBStats: DBStats;
  /** Stats for the 'leaf pre-images' DB */
  leafPreimagesDBStats: DBStats;
  /** Stats for the 'leaf indices' DB */
  leafIndicesDBStats: DBStats;
  /** Stats for the 'block indices' DB */
  blockIndicesDBStats: DBStats;
}

export interface WorldStateMeta {
  /** Tree meta for the note hash tree */
  noteHashTreeMeta: TreeMeta;
  /** Tree meta for the message tree */
  messageTreeMeta: TreeMeta;
  /** Tree meta for the archive tree */
  archiveTreeMeta: TreeMeta;
  /** Tree meta for the public data tree */
  publicDataTreeMeta: TreeMeta;
  /** Tree meta for the nullifier tree */
  nullifierTreeMeta: TreeMeta;
}

export interface WorldStateDBStats {
  /** Full stats for the note hash tree */
  noteHashTreeStats: TreeDBStats;
  /** Full stats for the message tree */
  messageTreeStats: TreeDBStats;
  /** Full stats for the archive tree */
  archiveTreeStats: TreeDBStats;
  /** Full stats for the public data tree */
  publicDataTreeStats: TreeDBStats;
  /** Full stats for the nullifier tree */
  nullifierTreeStats: TreeDBStats;
}

export interface WorldStateStatusFull {
  summary: WorldStateStatusSummary;
  dbStats: WorldStateDBStats;
  meta: WorldStateMeta;
}

export function buildEmptyDBStats() {
  return {
    name: '',
    numDataItems: 0n,
    totalUsedSize: 0n,
  } as DBStats;
}

export function buildEmptyTreeDBStats() {
  return {
    mapSize: 0n,
    physicalFileSize: 0n,
    blocksDBStats: buildEmptyDBStats(),
    nodesDBStats: buildEmptyDBStats(),
    leafIndicesDBStats: buildEmptyDBStats(),
    leafKeysDBStats: buildEmptyDBStats(),
    leafPreimagesDBStats: buildEmptyDBStats(),
    blockIndicesDBStats: buildEmptyDBStats(),
  } as TreeDBStats;
}

export function buildEmptyTreeMeta() {
  return {
    name: '',
    depth: 0,
    size: 0n,
    committedSize: 0n,
    unfinalizedBlockHeight: BlockNumber.ZERO,
    finalizedBlockHeight: BlockNumber.ZERO,
    oldestHistoricBlock: BlockNumber.ZERO,
    root: Fr.ZERO,
    initialRoot: Fr.ZERO,
    initialSize: 0n,
  } as TreeMeta;
}

export function buildEmptyWorldStateMeta() {
  return {
    noteHashTreeMeta: buildEmptyTreeMeta(),
    messageTreeMeta: buildEmptyTreeMeta(),
    publicDataTreeMeta: buildEmptyTreeMeta(),
    nullifierTreeMeta: buildEmptyTreeMeta(),
    archiveTreeMeta: buildEmptyTreeMeta(),
  } as WorldStateMeta;
}

export function buildEmptyWorldStateDBStats() {
  return {
    noteHashTreeStats: buildEmptyTreeDBStats(),
    archiveTreeStats: buildEmptyTreeDBStats(),
    messageTreeStats: buildEmptyTreeDBStats(),
    publicDataTreeStats: buildEmptyTreeDBStats(),
    nullifierTreeStats: buildEmptyTreeDBStats(),
  } as WorldStateDBStats;
}

export function buildEmptyWorldStateSummary() {
  return {
    unfinalizedBlockNumber: BlockNumber.ZERO,
    finalizedBlockNumber: BlockNumber.ZERO,
    oldestHistoricalBlock: BlockNumber.ZERO,
    treesAreSynched: true,
  } as WorldStateStatusSummary;
}

export function buildEmptyWorldStateStatusFull() {
  return {
    meta: buildEmptyWorldStateMeta(),
    dbStats: buildEmptyWorldStateDBStats(),
    summary: buildEmptyWorldStateSummary(),
  } as WorldStateStatusFull;
}

export function sanitizeSummary(summary: WorldStateStatusSummary) {
  summary.finalizedBlockNumber = BlockNumber.fromBigInt(BigInt(summary.finalizedBlockNumber));
  summary.unfinalizedBlockNumber = BlockNumber.fromBigInt(BigInt(summary.unfinalizedBlockNumber));
  summary.oldestHistoricalBlock = BlockNumber.fromBigInt(BigInt(summary.oldestHistoricalBlock));
  return summary;
}

export function sanitizeDBStats(stats: DBStats) {
  stats.numDataItems = BigInt(stats.numDataItems);
  stats.totalUsedSize = BigInt(stats.totalUsedSize);
  return stats;
}

export function sanitizeMeta(meta: TreeMeta) {
  meta.committedSize = BigInt(meta.committedSize);
  meta.finalizedBlockHeight = BlockNumber.fromBigInt(BigInt(meta.finalizedBlockHeight));
  meta.initialSize = BigInt(meta.initialSize);
  meta.oldestHistoricBlock = BlockNumber.fromBigInt(BigInt(meta.oldestHistoricBlock));
  meta.size = BigInt(meta.size);
  meta.unfinalizedBlockHeight = BlockNumber.fromBigInt(BigInt(meta.unfinalizedBlockHeight));
  return meta;
}

export function sanitizeTreeDBStats(stats: TreeDBStats) {
  stats.blocksDBStats = sanitizeDBStats(stats.blocksDBStats);
  stats.leafIndicesDBStats = sanitizeDBStats(stats.leafIndicesDBStats);
  stats.leafPreimagesDBStats = sanitizeDBStats(stats.leafPreimagesDBStats);
  stats.blockIndicesDBStats = sanitizeDBStats(stats.blockIndicesDBStats);
  stats.nodesDBStats = sanitizeDBStats(stats.nodesDBStats);
  stats.mapSize = BigInt(stats.mapSize);
  stats.physicalFileSize = BigInt(stats.physicalFileSize);
  return stats;
}

export function sanitizeWorldStateDBStats(stats: WorldStateDBStats) {
  stats.archiveTreeStats = sanitizeTreeDBStats(stats.archiveTreeStats);
  stats.messageTreeStats = sanitizeTreeDBStats(stats.messageTreeStats);
  stats.noteHashTreeStats = sanitizeTreeDBStats(stats.noteHashTreeStats);
  stats.nullifierTreeStats = sanitizeTreeDBStats(stats.nullifierTreeStats);
  stats.publicDataTreeStats = sanitizeTreeDBStats(stats.publicDataTreeStats);
  return stats;
}

export function sanitizeWorldStateTreeMeta(meta: WorldStateMeta) {
  meta.archiveTreeMeta = sanitizeMeta(meta.archiveTreeMeta);
  meta.messageTreeMeta = sanitizeMeta(meta.messageTreeMeta);
  meta.noteHashTreeMeta = sanitizeMeta(meta.noteHashTreeMeta);
  meta.nullifierTreeMeta = sanitizeMeta(meta.nullifierTreeMeta);
  meta.publicDataTreeMeta = sanitizeMeta(meta.publicDataTreeMeta);
  return meta;
}

export function sanitizeFullStatus(status: WorldStateStatusFull) {
  status.dbStats = sanitizeWorldStateDBStats(status.dbStats);
  status.summary = sanitizeSummary(status.summary);
  status.meta = sanitizeWorldStateTreeMeta(status.meta);
  return status;
}

export type SerializedLeafValue =
  | Buffer // Fr
  | { nullifier: Buffer } // NullifierLeaf
  | { value: Buffer; slot: Buffer }; // PublicDataTreeLeaf

export type SerializedIndexedLeaf = {
  leaf: Exclude<SerializedLeafValue, Buffer>;
  nextIndex: bigint | number;
  nextKey: Buffer; // Fr
};

export interface SerializedSiblingPathAndIndex {
  index: bigint;
  path: Buffer[];
}

export interface SerializedBatchInsertionResult {
  lowLeafWitnessData: ReadonlyArray<{
    leaf: SerializedIndexedLeaf;
    index: bigint | number;
    path: Buffer[];
  }>;
  sortedLeaves: ReadonlyArray<readonly [SerializedLeafValue, number]>;
  subtreePath: Buffer[];
}

export interface SerializedSequentialInsertionResult {
  lowLeafWitnessData: ReadonlyArray<{
    leaf: SerializedIndexedLeaf;
    index: bigint | number;
    path: Buffer[];
  }>;
  insertionWitnessData: ReadonlyArray<{
    leaf: SerializedIndexedLeaf;
    index: bigint | number;
    path: Buffer[];
  }>;
}

export type TreeStateReference = readonly [Buffer, number | bigint];
export type BlockStateReference = Map<Exclude<MerkleTreeId, MerkleTreeId.ARCHIVE>, TreeStateReference>;

export function treeStateReferenceToSnapshot([root, size]: TreeStateReference): AppendOnlyTreeSnapshot {
  return new AppendOnlyTreeSnapshot(Fr.fromBuffer(root), Number(size));
}

export function treeStateReference(snapshot: AppendOnlyTreeSnapshot) {
  return [snapshot.root.toBuffer(), BigInt(snapshot.nextAvailableLeafIndex)] as const;
}

export function blockStateReference(state: StateReference): BlockStateReference {
  return new Map([
    [MerkleTreeId.NULLIFIER_TREE, treeStateReference(state.partial.nullifierTree)],
    [MerkleTreeId.NOTE_HASH_TREE, treeStateReference(state.partial.noteHashTree)],
    [MerkleTreeId.PUBLIC_DATA_TREE, treeStateReference(state.partial.publicDataTree)],
    [MerkleTreeId.L1_TO_L2_MESSAGE_TREE, treeStateReference(state.l1ToL2MessageTree)],
  ]);
}
