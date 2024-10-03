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

  UPDATE_ARCHIVE,

  COMMIT,
  ROLLBACK,

  SYNC_BLOCK,

  CREATE_FORK,
  DELETE_FORK,

  CLOSE = 999,
}

interface WithTreeId {
  treeId: MerkleTreeId;
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
  batchesOfPaddedPublicDataWrites: readonly SerializedLeafValue[][];
}

interface SyncBlockResponse {
  isBlockOurs: boolean;
}

interface CreateForkRequest {
  blockNumber: number;
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

  [WorldStateMessageType.UPDATE_ARCHIVE]: UpdateArchiveRequest;

  [WorldStateMessageType.COMMIT]: void;
  [WorldStateMessageType.ROLLBACK]: void;

  [WorldStateMessageType.SYNC_BLOCK]: SyncBlockRequest;

  [WorldStateMessageType.CREATE_FORK]: CreateForkRequest;
  [WorldStateMessageType.DELETE_FORK]: DeleteForkRequest;

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

  [WorldStateMessageType.UPDATE_ARCHIVE]: void;

  [WorldStateMessageType.COMMIT]: void;
  [WorldStateMessageType.ROLLBACK]: void;

  [WorldStateMessageType.SYNC_BLOCK]: SyncBlockResponse;

  [WorldStateMessageType.CREATE_FORK]: CreateForkResponse;
  [WorldStateMessageType.DELETE_FORK]: void;

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
