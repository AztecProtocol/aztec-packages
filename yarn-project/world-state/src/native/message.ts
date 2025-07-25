import { Fr } from '@aztec/foundation/fields';
import type { Tuple } from '@aztec/foundation/serialize';
import { AppendOnlyTreeSnapshot, MerkleTreeId } from '@aztec/stdlib/trees';
import type { StateReference } from '@aztec/stdlib/tx';
import type { UInt32 } from '@aztec/stdlib/types';

export enum WorldStateMessageType {
  GET_TREE_INFO = 100,
  GET_STATE_REFERENCE,
  GET_INITIAL_STATE_REFERENCE,

  GET_LEAF_VALUE,
  GET_LEAF_PREIMAGE,
  GET_SIBLING_PATH,
  GET_BLOCK_NUMBERS_FOR_LEAF_INDICES,

  FIND_LEAF_INDICES,
  FIND_LOW_LEAF,
  FIND_SIBLING_PATHS,

  APPEND_LEAVES,
  BATCH_INSERT,
  SEQUENTIAL_INSERT,

  UPDATE_ARCHIVE,

  COMMIT,
  ROLLBACK,

  SYNC_BLOCK,

  CREATE_FORK,
  DELETE_FORK,

  FINALISE_BLOCKS,
  UNWIND_BLOCKS,
  REMOVE_HISTORICAL_BLOCKS,

  GET_STATUS,

  CREATE_CHECKPOINT,
  COMMIT_CHECKPOINT,
  REVERT_CHECKPOINT,
  COMMIT_ALL_CHECKPOINTS,
  REVERT_ALL_CHECKPOINTS,

  COPY_STORES,

  CLOSE = 999,
}

interface WithTreeId {
  treeId: MerkleTreeId;
}

export interface WorldStateStatusSummary {
  /** Last block number that can still be unwound. */
  unfinalisedBlockNumber: bigint;
  /** Last block number that is finalised and cannot be unwound. */
  finalisedBlockNumber: bigint;
  /** Oldest block still available for historical queries and forks. */
  oldestHistoricalBlock: bigint;
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
  oldestHistoricBlock: bigint;
  /** The current unfinalised block number of the tree */
  unfinalisedBlockHeight: bigint;
  /** The current finalised block number of the tree */
  finalisedBlockHeight: bigint;
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
    unfinalisedBlockHeight: 0n,
    finalisedBlockHeight: 0n,
    oldestHistoricBlock: 0n,
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
    unfinalisedBlockNumber: 0n,
    finalisedBlockNumber: 0n,
    oldestHistoricalBlock: 0n,
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

export function sanitiseSummary(summary: WorldStateStatusSummary) {
  summary.finalisedBlockNumber = BigInt(summary.finalisedBlockNumber);
  summary.unfinalisedBlockNumber = BigInt(summary.unfinalisedBlockNumber);
  summary.oldestHistoricalBlock = BigInt(summary.oldestHistoricalBlock);
  return summary;
}

export function sanitiseDBStats(stats: DBStats) {
  stats.numDataItems = BigInt(stats.numDataItems);
  stats.totalUsedSize = BigInt(stats.totalUsedSize);
  return stats;
}

export function sanitiseMeta(meta: TreeMeta) {
  meta.committedSize = BigInt(meta.committedSize);
  meta.finalisedBlockHeight = BigInt(meta.finalisedBlockHeight);
  meta.initialSize = BigInt(meta.initialSize);
  meta.oldestHistoricBlock = BigInt(meta.oldestHistoricBlock);
  meta.size = BigInt(meta.size);
  meta.unfinalisedBlockHeight = BigInt(meta.unfinalisedBlockHeight);
  return meta;
}

export function sanitiseTreeDBStats(stats: TreeDBStats) {
  stats.blocksDBStats = sanitiseDBStats(stats.blocksDBStats);
  stats.leafIndicesDBStats = sanitiseDBStats(stats.leafIndicesDBStats);
  stats.leafPreimagesDBStats = sanitiseDBStats(stats.leafPreimagesDBStats);
  stats.blockIndicesDBStats = sanitiseDBStats(stats.blockIndicesDBStats);
  stats.nodesDBStats = sanitiseDBStats(stats.nodesDBStats);
  stats.mapSize = BigInt(stats.mapSize);
  stats.physicalFileSize = BigInt(stats.physicalFileSize);
  return stats;
}

export function sanitiseWorldStateDBStats(stats: WorldStateDBStats) {
  stats.archiveTreeStats = sanitiseTreeDBStats(stats.archiveTreeStats);
  stats.messageTreeStats = sanitiseTreeDBStats(stats.messageTreeStats);
  stats.noteHashTreeStats = sanitiseTreeDBStats(stats.noteHashTreeStats);
  stats.nullifierTreeStats = sanitiseTreeDBStats(stats.nullifierTreeStats);
  stats.publicDataTreeStats = sanitiseTreeDBStats(stats.publicDataTreeStats);
  return stats;
}

export function sanitiseWorldStateTreeMeta(meta: WorldStateMeta) {
  meta.archiveTreeMeta = sanitiseMeta(meta.archiveTreeMeta);
  meta.messageTreeMeta = sanitiseMeta(meta.messageTreeMeta);
  meta.noteHashTreeMeta = sanitiseMeta(meta.noteHashTreeMeta);
  meta.nullifierTreeMeta = sanitiseMeta(meta.nullifierTreeMeta);
  meta.publicDataTreeMeta = sanitiseMeta(meta.publicDataTreeMeta);
  return meta;
}

export function sanitiseFullStatus(status: WorldStateStatusFull) {
  status.dbStats = sanitiseWorldStateDBStats(status.dbStats);
  status.summary = sanitiseSummary(status.summary);
  status.meta = sanitiseWorldStateTreeMeta(status.meta);
  return status;
}

interface WithForkId {
  forkId: number;
}

interface WithWorldStateRevision {
  revision: WorldStateRevision;
}

interface WithCanonicalForkId {
  canonical: true;
}

interface WithLeafIndex {
  leafIndex: bigint;
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

interface WithLeafValues {
  leaves: SerializedLeafValue[];
}

interface BlockShiftRequest extends WithCanonicalForkId {
  toBlockNumber: bigint;
}

interface WithLeaves {
  leaves: SerializedLeafValue[];
}

interface GetTreeInfoRequest extends WithTreeId, WithWorldStateRevision {}
interface GetTreeInfoResponse {
  treeId: MerkleTreeId;
  depth: UInt32;
  size: bigint | number;
  root: Buffer;
}

interface GetBlockNumbersForLeafIndicesRequest extends WithTreeId, WithWorldStateRevision {
  leafIndices: bigint[];
}

interface GetBlockNumbersForLeafIndicesResponse {
  blockNumbers: bigint[];
}

interface GetSiblingPathRequest extends WithTreeId, WithLeafIndex, WithWorldStateRevision {}
type GetSiblingPathResponse = Buffer[];

interface GetStateReferenceRequest extends WithWorldStateRevision {}
interface GetStateReferenceResponse {
  state: Record<MerkleTreeId, TreeStateReference>;
}

interface GetLeafRequest extends WithTreeId, WithWorldStateRevision, WithLeafIndex {}
type GetLeafResponse = SerializedLeafValue | undefined;

interface GetLeafPreImageRequest extends WithTreeId, WithLeafIndex, WithWorldStateRevision {}
type GetLeafPreImageResponse = SerializedIndexedLeaf | undefined;

interface FindLeafIndicesRequest extends WithTreeId, WithLeafValues, WithWorldStateRevision {
  startIndex: bigint;
}
interface FindLeafIndicesResponse {
  indices: bigint[];
}

interface FindSiblingPathsRequest extends WithTreeId, WithLeafValues, WithWorldStateRevision {}

interface SiblingPathAndIndex {
  index: bigint;
  path: Buffer[];
}
interface FindSiblingPathsResponse {
  paths: (SiblingPathAndIndex | undefined)[];
}

interface FindLowLeafRequest extends WithTreeId, WithWorldStateRevision {
  key: Fr;
}
interface FindLowLeafResponse {
  index: bigint | number;
  alreadyPresent: boolean;
}

interface AppendLeavesRequest extends WithTreeId, WithForkId, WithLeaves {}

interface BatchInsertRequest extends WithTreeId, WithForkId, WithLeaves {
  subtreeDepth: number;
}

interface BatchInsertResponse {
  low_leaf_witness_data: ReadonlyArray<{
    leaf: SerializedIndexedLeaf;
    index: bigint | number;
    path: Tuple<Buffer, number>;
  }>;
  sorted_leaves: ReadonlyArray<[SerializedLeafValue, UInt32]>;
  subtree_path: Tuple<Buffer, number>;
}

interface SequentialInsertRequest extends WithTreeId, WithForkId, WithLeaves {}

interface SequentialInsertResponse {
  low_leaf_witness_data: ReadonlyArray<{
    leaf: SerializedIndexedLeaf;
    index: bigint | number;
    path: Tuple<Buffer, number>;
  }>;
  insertion_witness_data: ReadonlyArray<{
    leaf: SerializedIndexedLeaf;
    index: bigint | number;
    path: Tuple<Buffer, number>;
  }>;
}

interface UpdateArchiveRequest extends WithForkId {
  blockStateRef: BlockStateReference;
  blockHeaderHash: Buffer;
}

interface SyncBlockRequest extends WithCanonicalForkId {
  blockNumber: number;
  blockStateRef: BlockStateReference;
  blockHeaderHash: Fr;
  paddedNoteHashes: readonly SerializedLeafValue[];
  paddedL1ToL2Messages: readonly SerializedLeafValue[];
  paddedNullifiers: readonly SerializedLeafValue[];
  publicDataWrites: readonly SerializedLeafValue[];
}

interface CreateForkRequest extends WithCanonicalForkId {
  latest: boolean;
  blockNumber: number;
}

interface CreateForkResponse {
  forkId: number;
}

interface DeleteForkRequest extends WithForkId {}

interface CopyStoresRequest extends WithCanonicalForkId {
  dstPath: string;
  compact: boolean;
}

export type WorldStateRequestCategories = WithForkId | WithWorldStateRevision | WithCanonicalForkId;

export function isWithForkId(body: WorldStateRequestCategories): body is WithForkId {
  return body && 'forkId' in body;
}

export function isWithRevision(body: WorldStateRequestCategories): body is WithWorldStateRevision {
  return body && 'revision' in body;
}

export function isWithCanonical(body: WorldStateRequestCategories): body is WithCanonicalForkId {
  return body && 'canonical' in body;
}

export type WorldStateRequest = {
  [WorldStateMessageType.GET_TREE_INFO]: GetTreeInfoRequest;
  [WorldStateMessageType.GET_STATE_REFERENCE]: GetStateReferenceRequest;
  [WorldStateMessageType.GET_INITIAL_STATE_REFERENCE]: WithCanonicalForkId;

  [WorldStateMessageType.GET_LEAF_VALUE]: GetLeafRequest;
  [WorldStateMessageType.GET_LEAF_PREIMAGE]: GetLeafPreImageRequest;
  [WorldStateMessageType.GET_SIBLING_PATH]: GetSiblingPathRequest;
  [WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES]: GetBlockNumbersForLeafIndicesRequest;

  [WorldStateMessageType.FIND_LEAF_INDICES]: FindLeafIndicesRequest;
  [WorldStateMessageType.FIND_LOW_LEAF]: FindLowLeafRequest;
  [WorldStateMessageType.FIND_SIBLING_PATHS]: FindSiblingPathsRequest;

  [WorldStateMessageType.APPEND_LEAVES]: AppendLeavesRequest;
  [WorldStateMessageType.BATCH_INSERT]: BatchInsertRequest;
  [WorldStateMessageType.SEQUENTIAL_INSERT]: SequentialInsertRequest;

  [WorldStateMessageType.UPDATE_ARCHIVE]: UpdateArchiveRequest;

  [WorldStateMessageType.COMMIT]: WithCanonicalForkId;
  [WorldStateMessageType.ROLLBACK]: WithCanonicalForkId;

  [WorldStateMessageType.SYNC_BLOCK]: SyncBlockRequest;

  [WorldStateMessageType.CREATE_FORK]: CreateForkRequest;
  [WorldStateMessageType.DELETE_FORK]: DeleteForkRequest;

  [WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS]: BlockShiftRequest;
  [WorldStateMessageType.UNWIND_BLOCKS]: BlockShiftRequest;
  [WorldStateMessageType.FINALISE_BLOCKS]: BlockShiftRequest;

  [WorldStateMessageType.GET_STATUS]: WithCanonicalForkId;

  [WorldStateMessageType.CREATE_CHECKPOINT]: WithForkId;
  [WorldStateMessageType.COMMIT_CHECKPOINT]: WithForkId;
  [WorldStateMessageType.REVERT_CHECKPOINT]: WithForkId;
  [WorldStateMessageType.COMMIT_ALL_CHECKPOINTS]: WithForkId;
  [WorldStateMessageType.REVERT_ALL_CHECKPOINTS]: WithForkId;

  [WorldStateMessageType.COPY_STORES]: CopyStoresRequest;

  [WorldStateMessageType.CLOSE]: WithCanonicalForkId;
};

export type WorldStateResponse = {
  [WorldStateMessageType.GET_TREE_INFO]: GetTreeInfoResponse;
  [WorldStateMessageType.GET_STATE_REFERENCE]: GetStateReferenceResponse;
  [WorldStateMessageType.GET_INITIAL_STATE_REFERENCE]: GetStateReferenceResponse;

  [WorldStateMessageType.GET_LEAF_VALUE]: GetLeafResponse;
  [WorldStateMessageType.GET_LEAF_PREIMAGE]: GetLeafPreImageResponse;
  [WorldStateMessageType.GET_SIBLING_PATH]: GetSiblingPathResponse;
  [WorldStateMessageType.GET_BLOCK_NUMBERS_FOR_LEAF_INDICES]: GetBlockNumbersForLeafIndicesResponse;

  [WorldStateMessageType.FIND_LEAF_INDICES]: FindLeafIndicesResponse;
  [WorldStateMessageType.FIND_LOW_LEAF]: FindLowLeafResponse;
  [WorldStateMessageType.FIND_SIBLING_PATHS]: FindSiblingPathsResponse;

  [WorldStateMessageType.APPEND_LEAVES]: void;
  [WorldStateMessageType.BATCH_INSERT]: BatchInsertResponse;
  [WorldStateMessageType.SEQUENTIAL_INSERT]: SequentialInsertResponse;

  [WorldStateMessageType.UPDATE_ARCHIVE]: void;

  [WorldStateMessageType.COMMIT]: void;
  [WorldStateMessageType.ROLLBACK]: void;

  [WorldStateMessageType.SYNC_BLOCK]: WorldStateStatusFull;

  [WorldStateMessageType.CREATE_FORK]: CreateForkResponse;
  [WorldStateMessageType.DELETE_FORK]: void;

  [WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS]: WorldStateStatusFull;
  [WorldStateMessageType.UNWIND_BLOCKS]: WorldStateStatusFull;
  [WorldStateMessageType.FINALISE_BLOCKS]: WorldStateStatusSummary;

  [WorldStateMessageType.GET_STATUS]: WorldStateStatusSummary;

  [WorldStateMessageType.CREATE_CHECKPOINT]: void;
  [WorldStateMessageType.COMMIT_CHECKPOINT]: void;
  [WorldStateMessageType.REVERT_CHECKPOINT]: void;
  [WorldStateMessageType.COMMIT_ALL_CHECKPOINTS]: void;
  [WorldStateMessageType.REVERT_ALL_CHECKPOINTS]: void;

  [WorldStateMessageType.COPY_STORES]: void;

  [WorldStateMessageType.CLOSE]: void;
};

export type WorldStateRevision = {
  forkId: number;
  blockNumber: number;
  includeUncommitted: boolean;
};
export function worldStateRevision(
  includeUncommitted: boolean,
  forkId: number | undefined,
  blockNumber: number | undefined,
): WorldStateRevision {
  return {
    forkId: forkId ?? 0,
    blockNumber: blockNumber ?? 0,
    includeUncommitted,
  };
}

type TreeStateReference = readonly [Buffer, number | bigint];
type BlockStateReference = Map<Exclude<MerkleTreeId, MerkleTreeId.ARCHIVE>, TreeStateReference>;

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
