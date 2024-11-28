import { MerkleTreeId } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, Fr, type StateReference, type UInt32 } from '@aztec/circuits.js';
import { type Tuple } from '@aztec/foundation/serialize';

export type MessageHeaderInit = {
  /** The message ID. Optional, if not set defaults to 0 */
  messageId?: number;
  /** Identifies the original request. Optional */
  requestId?: number;
};

export class MessageHeader {
  /** An number to identify this message */
  public readonly messageId: number;
  /** If this message is a response to a request, the messageId of the request */
  public readonly requestId: number;

  constructor({ messageId, requestId }: MessageHeaderInit) {
    this.messageId = messageId ?? 0;
    this.requestId = requestId ?? 0;
  }

  static fromMessagePack(data: object): MessageHeader {
    return new MessageHeader(data as MessageHeaderInit);
  }
}

interface TypedMessageLike {
  msgType: number;
  header: {
    messageId?: number;
    requestId?: number;
  };
  value: any;
}

export class TypedMessage<T, B> {
  public constructor(public readonly msgType: T, public readonly header: MessageHeader, public readonly value: B) {}

  static fromMessagePack<T, B>(data: TypedMessageLike): TypedMessage<T, B> {
    return new TypedMessage<T, B>(data['msgType'] as T, MessageHeader.fromMessagePack(data['header']), data['value']);
  }

  static isTypedMessageLike(obj: any): obj is TypedMessageLike {
    return typeof obj === 'object' && obj !== null && 'msgType' in obj && 'header' in obj && 'value' in obj;
  }
}

export enum WorldStateMessageType {
  GET_TREE_INFO = 100,
  GET_STATE_REFERENCE,
  GET_INITIAL_STATE_REFERENCE,

  GET_LEAF_VALUE,
  GET_LEAF_PREIMAGE,
  GET_SIBLING_PATH,

  FIND_LEAF_INDEX,
  FIND_LOW_LEAF,

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
  /** Stats for the 'blocks' DB */
  blocksDBStats: DBStats;
  /** Stats for the 'nodes' DB */
  nodesDBStats: DBStats;
  /** Stats for the 'leaf pre-images' DB */
  leafPreimagesDBStats: DBStats;
  /** Stats for the 'leaf indices' DB */
  leafIndicesDBStats: DBStats;
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
    blocksDBStats: buildEmptyDBStats(),
    nodesDBStats: buildEmptyDBStats(),
    leafIndicesDBStats: buildEmptyDBStats(),
    leafKeysDBStats: buildEmptyDBStats(),
    leafPreimagesDBStats: buildEmptyDBStats(),
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
  stats.nodesDBStats = sanitiseDBStats(stats.nodesDBStats);
  stats.mapSize = BigInt(stats.mapSize);
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

interface WithLeafIndex {
  leafIndex: bigint;
}

export type SerializedLeafValue =
  | Buffer // Fr
  | { value: Buffer } // NullifierLeaf
  | { value: Buffer; slot: Buffer }; // PublicDataTreeLeaf

export type SerializedIndexedLeaf = {
  value: Exclude<SerializedLeafValue, Buffer>;
  nextIndex: bigint | number;
  nextValue: Buffer; // Fr
};

interface WithLeafValue {
  leaf: SerializedLeafValue;
}

interface BlockShiftRequest {
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

interface FindLeafIndexRequest extends WithTreeId, WithLeafValue, WithWorldStateRevision {
  startIndex: bigint;
}
type FindLeafIndexResponse = bigint | null;

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

interface SyncBlockRequest {
  blockNumber: number;
  blockStateRef: BlockStateReference;
  blockHeaderHash: Fr;
  paddedNoteHashes: readonly SerializedLeafValue[];
  paddedL1ToL2Messages: readonly SerializedLeafValue[];
  paddedNullifiers: readonly SerializedLeafValue[];
  publicDataWrites: readonly SerializedLeafValue[];
}

interface CreateForkRequest {
  latest: boolean;
  blockNumber: number;
}

interface CreateForkResponse {
  forkId: number;
}

interface DeleteForkRequest {
  forkId: number;
}

interface CreateForkResponse {
  forkId: number;
}

interface DeleteForkRequest {
  forkId: number;
}

export type WorldStateRequest = {
  [WorldStateMessageType.GET_TREE_INFO]: GetTreeInfoRequest;
  [WorldStateMessageType.GET_STATE_REFERENCE]: GetStateReferenceRequest;
  [WorldStateMessageType.GET_INITIAL_STATE_REFERENCE]: void;

  [WorldStateMessageType.GET_LEAF_VALUE]: GetLeafRequest;
  [WorldStateMessageType.GET_LEAF_PREIMAGE]: GetLeafPreImageRequest;
  [WorldStateMessageType.GET_SIBLING_PATH]: GetSiblingPathRequest;

  [WorldStateMessageType.FIND_LEAF_INDEX]: FindLeafIndexRequest;
  [WorldStateMessageType.FIND_LOW_LEAF]: FindLowLeafRequest;

  [WorldStateMessageType.APPEND_LEAVES]: AppendLeavesRequest;
  [WorldStateMessageType.BATCH_INSERT]: BatchInsertRequest;
  [WorldStateMessageType.SEQUENTIAL_INSERT]: SequentialInsertRequest;

  [WorldStateMessageType.UPDATE_ARCHIVE]: UpdateArchiveRequest;

  [WorldStateMessageType.COMMIT]: void;
  [WorldStateMessageType.ROLLBACK]: void;

  [WorldStateMessageType.SYNC_BLOCK]: SyncBlockRequest;

  [WorldStateMessageType.CREATE_FORK]: CreateForkRequest;
  [WorldStateMessageType.DELETE_FORK]: DeleteForkRequest;

  [WorldStateMessageType.REMOVE_HISTORICAL_BLOCKS]: BlockShiftRequest;
  [WorldStateMessageType.UNWIND_BLOCKS]: BlockShiftRequest;
  [WorldStateMessageType.FINALISE_BLOCKS]: BlockShiftRequest;

  [WorldStateMessageType.GET_STATUS]: void;

  [WorldStateMessageType.CLOSE]: void;
};

export type WorldStateResponse = {
  [WorldStateMessageType.GET_TREE_INFO]: GetTreeInfoResponse;
  [WorldStateMessageType.GET_STATE_REFERENCE]: GetStateReferenceResponse;
  [WorldStateMessageType.GET_INITIAL_STATE_REFERENCE]: GetStateReferenceResponse;

  [WorldStateMessageType.GET_LEAF_VALUE]: GetLeafResponse;
  [WorldStateMessageType.GET_LEAF_PREIMAGE]: GetLeafPreImageResponse;
  [WorldStateMessageType.GET_SIBLING_PATH]: GetSiblingPathResponse;

  [WorldStateMessageType.FIND_LEAF_INDEX]: FindLeafIndexResponse;
  [WorldStateMessageType.FIND_LOW_LEAF]: FindLowLeafResponse;

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
