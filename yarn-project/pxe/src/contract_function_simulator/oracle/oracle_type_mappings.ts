import {
  CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
  FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NULLIFIER_TREE_HEIGHT,
  PRIVATE_LOG_CIPHERTEXT_LEN,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { FieldReader } from '@aztec/foundation/serialize';
import { MembershipWitness, type SiblingPath } from '@aztec/foundation/trees';
import { type ACVMField, fromUintArray } from '@aztec/simulator/client';
import { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractInstance, PartialAddress } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import {
  type AppTaggingSecretKind,
  type FlatPublicLogs,
  PrivateLog,
  Tag,
  appTaggingSecretKindFromDeliveryMode,
} from '@aztec/stdlib/logs';
import {
  type AppendOnlyTreeSnapshot,
  type NullifierLeaf,
  type NullifierLeafPreimage,
  NullifierMembershipWitness,
  type PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  type GlobalVariables,
  type PartialStateReference,
  type StateReference,
  TxHash,
} from '@aztec/stdlib/tx';

import type { OriginBlock, RetractableFactOrigin } from '../../storage/fact_store/index.js';
import { BoundedVec } from '../noir-structs/bounded_vec.js';
import type { ContractClassLogData } from '../noir-structs/contract_class_log_data.js';
import type { EmbeddedCurvePoint } from '../noir-structs/embedded_curve_point.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import type { Fact } from '../noir-structs/fact.js';
import type { FactCollection } from '../noir-structs/fact_collection.js';
import { type LogRetrievalRequest, type LogSource, logSourceFromField } from '../noir-structs/log_retrieval_request.js';
import type { LegacyLogRetrievalResponseV2, LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import type { MessageContext } from '../noir-structs/message_context.js';
import type { NoteData } from '../noir-structs/note_data.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import { Option } from '../noir-structs/option.js';
import type { LegacyPendingTaggedLog, PendingTaggedLog } from '../noir-structs/pending_tagged_log.js';
import type { ProvidedSecret } from '../noir-structs/provided_secret.js';
import {
  type ResolvedTaggingStrategy,
  resolvedTaggingStrategyFromFields,
  resolvedTaggingStrategyToFields,
} from '../noir-structs/resolved_tagging_strategy.js';
import type { ResolvedTx } from '../noir-structs/resolved_tx.js';
import type { TxEffectData } from '../noir-structs/tx_effect_data.js';
import type { UtilityContext } from '../noir-structs/utility_context.js';
import type { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';
import { packAsHintedNote } from './note_packing_utils.js';

// `ORACLE_REGISTRY` infers its entry signatures from these mappings, so its emitted declaration (and the oracle
// interfaces derived from it) names the protocol types below. Re-exporting them gives tsc a portable path to each
// type instead of falling back to a deep node_modules path that breaks .d.ts portability (TS2742).
export type {
  AppTaggingSecretKind,
  BlockHash,
  BlockHeader,
  ContractInstance,
  MembershipWitness,
  NullifierMembershipWitness,
  PendingTaggedLog,
  PublicDataWitness,
  TxHash,
};

// ─── Core Types ──────────────────────────────────────────────────────────────

/** One ACVM input slot: an array of hex-encoded field strings. */
export type InputSlot = ACVMField[];

/** One ACVM output slot: a scalar hex string or an array of hex strings. */
export type OutputSlot = ACVMField | ACVMField[];

/**
 * Wire layout of a single slot:
 * - `'scalar'` — a bare field (one `Fr`); on the ACVM/Noir wire a `Field`.
 * - `{ len }`  — an array of exactly `len` fields (`Fr[]`); a `[Field; len]`.
 * - `'variable'` — a slot whose field count is not statically known and cannot be sized on demand (a string, a
 *   length-prefixed struct). It contributes to the slot count but can never be zero-filled.
 * - `{ lenFrom: fn }` — like `'variable'`, but its field count can be resolved from a runtime size descriptor. The
 *   descriptor's shape is type-specific (e.g. `{ length }`, `{ maxLength }`), so `size` is typed `any`: a single union
 *   can't type each mapping's distinct `lenFrom` under parameter contravariance.
 */
export type SlotShape = 'scalar' | { len: number } | 'variable' | { lenFrom: (size: any) => number };

/**
 * Describes how to serialize and/or deserialize a single typed value to/from ACVM wire format.
 * Either side is optional — output-only types omit `deserialization`, input-only types omit `serialization`.
 */
export interface TypeMapping<T = any> {
  serialization?: {
    /** Convert a typed value to ACVM output slot(s). */
    fn: (value: T) => (Fr | Fr[])[];
  };
  deserialization?: {
    /** Read a typed value from its slots — one {@link FieldReader} per slot, as laid out by {@link shape}. */
    fn: (readers: FieldReader[]) => T;
  };
  /**
   * The type's wire layout, one entry per slot.
   *
   * Examples:
   * - `FIELD` → `['scalar']` // single slot
   * - `OPTION(T)` → `['scalar', ...T.shape]` // [discriminant], [...inner.shape]
   * - `CONTRACT_CLASS_LOG` → `['scalar', { len: N }, 'scalar']` // [addr], [fields], [len]
   */
  shape: SlotShape[];
}

export type MaybePromise<T> = T | Promise<T>;

/**
 * Asserts that every reader was fully consumed by a deserialization, throwing on leftover fields.
 */
export function assertReadersConsumed(readers: FieldReader[]): void {
  readers.forEach((reader, slot) => {
    if (!reader.isFinished()) {
      throw new Error(
        `Malformed oracle input: ${reader.remainingFields()} unexpected trailing field(s) in slot ${slot}`,
      );
    }
  });
}

// ─── Scalar Type Mappings ────────────────────────────────────────────────────

export const FIELD: TypeMapping<Fr> = {
  serialization: { fn: v => [v] },
  deserialization: { fn: ([reader]) => reader.readField() },
  shape: ['scalar'],
};

export const BOOL: TypeMapping<boolean> = {
  serialization: { fn: v => [new Fr(v ? 1n : 0n)] },
  deserialization: { fn: ([reader]) => !reader.readField().isZero() },
  shape: ['scalar'],
};

export const U32: TypeMapping<number> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: {
    fn: ([reader]) => {
      const value = reader.readField().toBigInt();
      if (value > 0xffffffffn) {
        throw new Error(`U32 overflow: value ${value} exceeds u32 max (${0xffffffffn})`);
      }
      return Number(value);
    },
  },
  shape: ['scalar'],
};

export const BLOCK_NUMBER: TypeMapping<BlockNumber> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => BlockNumber(reader.readField().toNumber()) },
  shape: ['scalar'],
};

/** A u8 byte: serializes to a single Fr; deserializes from a single Fr to a number in [0, 255]. */
export const BYTE: TypeMapping<number> = {
  serialization: { fn: byte => [new Fr(byte)] },
  deserialization: {
    fn: ([reader]) => {
      const value = reader.readField().toBigInt();
      if (value > 0xffn) {
        throw new Error(`BYTE overflow: value ${value} exceeds u8 max (255)`);
      }
      return Number(value);
    },
  },
  shape: ['scalar'],
};

// Noir passes `MessageDelivery` onchain variants here.
export const DELIVERY_MODE: TypeMapping<AppTaggingSecretKind> = {
  deserialization: {
    fn: readers => appTaggingSecretKindFromDeliveryMode(BYTE.deserialization!.fn(readers)),
  },
  shape: BYTE.shape,
};

export const RESOLVED_TAGGING_STRATEGY: TypeMapping<ResolvedTaggingStrategy> = {
  serialization: { fn: resolved => resolvedTaggingStrategyToFields(resolved) },
  deserialization: {
    fn: ([kindReader, secretReader]) =>
      resolvedTaggingStrategyFromFields(kindReader.readField().toNumber(), secretReader.readField()),
  },
  shape: ['scalar', 'scalar'],
};

export const BIGINT: TypeMapping<bigint> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => reader.readField().toBigInt() },
  shape: ['scalar'],
};

/** Reads every field in the slot as a UTF-8 character code. */
export const STR: TypeMapping<string> = {
  serialization: { fn: str => [Array.from(Buffer.from(str, 'utf-8')).map(b => new Fr(b))] },
  deserialization: {
    fn: ([reader]) => {
      const chars: string[] = [];
      while (!reader.isFinished()) {
        chars.push(String.fromCharCode(reader.readField().toNumber()));
      }
      return chars.join('');
    },
  },
  shape: ['variable'],
};

export const AZTEC_ADDRESS: TypeMapping<AztecAddress> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => AztecAddress.fromFieldUnsafe(reader.readField()) },
  shape: ['scalar'],
};

export const BLOCK_HASH: TypeMapping<BlockHash> = {
  serialization: { fn: v => [new Fr(v.toBuffer())] },
  deserialization: { fn: ([reader]) => new BlockHash(reader.readField()) },
  shape: ['scalar'],
};

export const FUNCTION_SELECTOR: TypeMapping<FunctionSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => FunctionSelector.fromField(reader.readField()) },
  shape: ['scalar'],
};

export const NOTE_SELECTOR: TypeMapping<NoteSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => NoteSelector.fromField(reader.readField()) },
  shape: ['scalar'],
};

export const TX_HASH: TypeMapping<TxHash> = {
  serialization: { fn: v => [v.hash] },
  deserialization: { fn: ([reader]) => TxHash.fromField(reader.readField()) },
  shape: ['scalar'],
};

const TAG: TypeMapping<Tag> = {
  serialization: { fn: v => [v.value] },
  deserialization: { fn: ([reader]) => new Tag(reader.readField()) },
  shape: ['scalar'],
};

export const POINT: TypeMapping<EmbeddedCurvePoint> = STRUCT([
  { name: 'x', type: FIELD },
  { name: 'y', type: FIELD },
]);

const LOG_SOURCE: TypeMapping<LogSource> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => logSourceFromField(reader.readField()) },
  shape: ['scalar'],
};

export const ETH_ADDRESS: TypeMapping<EthAddress> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => EthAddress.fromField(reader.readField()) },
  shape: ['scalar'],
};

const SLOT_NUMBER: TypeMapping<SlotNumber> = {
  serialization: { fn: v => [new Fr(v)] },
  shape: ['scalar'],
};

const APPEND_ONLY_TREE_SNAPSHOT: TypeMapping<AppendOnlyTreeSnapshot> = STRUCT<AppendOnlyTreeSnapshot>([
  { name: 'root', type: FIELD },
  { name: 'nextAvailableLeafIndex', type: U32 },
]);

const PARTIAL_STATE_REFERENCE: TypeMapping<PartialStateReference> = STRUCT<PartialStateReference>([
  { name: 'noteHashTree', type: APPEND_ONLY_TREE_SNAPSHOT },
  { name: 'nullifierTree', type: APPEND_ONLY_TREE_SNAPSHOT },
  { name: 'publicDataTree', type: APPEND_ONLY_TREE_SNAPSHOT },
]);

const STATE_REFERENCE: TypeMapping<StateReference> = STRUCT<StateReference>([
  { name: 'l1ToL2MessageTree', type: APPEND_ONLY_TREE_SNAPSHOT },
  { name: 'partial', type: PARTIAL_STATE_REFERENCE },
]);

const GAS_FEES: TypeMapping<GasFees> = STRUCT<GasFees>([
  { name: 'feePerDaGas', type: BIGINT },
  { name: 'feePerL2Gas', type: BIGINT },
]);

const GLOBAL_VARIABLES: TypeMapping<GlobalVariables> = STRUCT<GlobalVariables>([
  { name: 'chainId', type: FIELD },
  { name: 'version', type: FIELD },
  { name: 'blockNumber', type: BLOCK_NUMBER },
  { name: 'slotNumber', type: SLOT_NUMBER },
  { name: 'timestamp', type: BIGINT },
  { name: 'coinbase', type: ETH_ADDRESS },
  { name: 'feeRecipient', type: AZTEC_ADDRESS },
  { name: 'gasFees', type: GAS_FEES },
]);

export const BLOCK_HEADER: TypeMapping<BlockHeader> = STRUCT<BlockHeader>([
  { name: 'lastArchive', type: APPEND_ONLY_TREE_SNAPSHOT },
  { name: 'state', type: STATE_REFERENCE },
  { name: 'spongeBlobHash', type: FIELD },
  { name: 'globalVariables', type: GLOBAL_VARIABLES },
  { name: 'totalFees', type: FIELD },
  { name: 'totalManaUsed', type: FIELD },
]);

export const KEY_VALIDATION_REQUEST: TypeMapping<KeyValidationRequest> = STRUCT<KeyValidationRequest>([
  { name: 'pkMHash', type: FIELD },
  { name: 'skApp', type: FIELD },
]);

const PUBLIC_KEYS: TypeMapping<PublicKeys> = STRUCT<PublicKeys>([
  { name: 'npkMHash', type: FIELD },
  { name: 'ivpkM', type: POINT },
  { name: 'ovpkMHash', type: FIELD },
  { name: 'tpkMHash', type: FIELD },
  { name: 'mspkMHash', type: FIELD },
  { name: 'fbpkMHash', type: FIELD },
]);

export const CONTRACT_INSTANCE: TypeMapping<ContractInstance> = STRUCT<ContractInstance>([
  { name: 'salt', type: FIELD },
  { name: 'deployer', type: AZTEC_ADDRESS },
  // Note that the nr side of this struct does not contain the current class, only original
  { name: 'originalContractClassId', type: FIELD },
  { name: 'initializationHash', type: FIELD },
  { name: 'immutablesHash', type: FIELD },
  { name: 'publicKeys', type: PUBLIC_KEYS },
]);

const NULLIFIER_LEAF: TypeMapping<NullifierLeaf> = STRUCT<NullifierLeaf>([{ name: 'nullifier', type: FIELD }]);

const NULLIFIER_LEAF_PREIMAGE: TypeMapping<NullifierLeafPreimage> = STRUCT<NullifierLeafPreimage>([
  { name: 'leaf', type: NULLIFIER_LEAF },
  { name: 'nextKey', type: FIELD },
  { name: 'nextIndex', type: BIGINT },
]);

export const NULLIFIER_MEMBERSHIP_WITNESS: TypeMapping<NullifierMembershipWitness> = STRUCT<NullifierMembershipWitness>(
  [
    { name: 'leafPreimage', type: NULLIFIER_LEAF_PREIMAGE },
    { name: 'index', type: BIGINT },
    { name: 'siblingPath', type: SIBLING_PATH(NULLIFIER_TREE_HEIGHT) },
  ],
);

const PUBLIC_DATA_LEAF: TypeMapping<PublicDataTreeLeaf> = STRUCT<PublicDataTreeLeaf>([
  { name: 'slot', type: FIELD },
  { name: 'value', type: FIELD },
]);

const PUBLIC_DATA_LEAF_PREIMAGE: TypeMapping<PublicDataTreeLeafPreimage> = STRUCT<PublicDataTreeLeafPreimage>([
  { name: 'leaf', type: PUBLIC_DATA_LEAF },
  { name: 'nextKey', type: FIELD },
  { name: 'nextIndex', type: BIGINT },
]);

export const PUBLIC_DATA_WITNESS: TypeMapping<PublicDataWitness> = STRUCT<PublicDataWitness>([
  { name: 'index', type: BIGINT },
  { name: 'leafPreimage', type: PUBLIC_DATA_LEAF_PREIMAGE },
  { name: 'siblingPath', type: SIBLING_PATH(PUBLIC_DATA_TREE_HEIGHT) },
]);

export const MESSAGE_LOAD_ORACLE_INPUTS: TypeMapping<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> = STRUCT<
  MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>
>([
  { name: 'index', type: BIGINT },
  { name: 'siblingPath', type: SIBLING_PATH(L1_TO_L2_MSG_TREE_HEIGHT) },
]);

export const UTILITY_CONTEXT: TypeMapping<UtilityContext> = STRUCT<UtilityContext>([
  { name: 'blockHeader', type: BLOCK_HEADER },
  { name: 'contractAddress', type: AZTEC_ADDRESS },
  { name: 'msgSender', type: AZTEC_ADDRESS },
]);

export const CALL_PRIVATE_RESULT: TypeMapping<{ endSideEffectCounter: Fr; returnsHash: Fr }> = STRUCT([
  { name: 'endSideEffectCounter', type: FIELD },
  { name: 'returnsHash', type: FIELD },
]);

export const PUBLIC_KEYS_AND_PARTIAL_ADDRESS: TypeMapping<{
  publicKeys: PublicKeys;
  partialAddress: PartialAddress;
}> = STRUCT([
  { name: 'publicKeys', type: PUBLIC_KEYS },
  { name: 'partialAddress', type: FIELD },
]);

export const CONTRACT_CLASS_LOG: TypeMapping<ContractClassLogData> = STRUCT([
  { name: 'contractAddress', type: AZTEC_ADDRESS },
  { name: 'fields', type: FIXED_ARRAY(FIELD, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS) },
  { name: 'emittedLength', type: U32 },
]);

const REVERT_CODE: TypeMapping<RevertCode> = {
  serialization: { fn: rc => [rc.toField()] },
  shape: ['scalar'],
};

const PUBLIC_DATA_WRITE: TypeMapping<PublicDataWrite> = STRUCT<PublicDataWrite>([
  { name: 'leafSlot', type: FIELD },
  { name: 'value', type: FIELD },
]);

const PRIVATE_LOG: TypeMapping<PrivateLog> = STRUCT<PrivateLog>([
  { name: 'fields', type: FIXED_ARRAY(FIELD, PRIVATE_LOG_SIZE_IN_FIELDS) },
  { name: 'emittedLength', type: U32 },
]);

const FLAT_PUBLIC_LOGS: TypeMapping<FlatPublicLogs> = STRUCT<FlatPublicLogs>([
  { name: 'length', type: U32 },
  { name: 'payload', type: FIXED_ARRAY(FIELD, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH) },
]);

const CONTRACT_CLASS_LOG_ENTRY: TypeMapping<ContractClassLogData> = STRUCT<ContractClassLogData>([
  { name: 'fields', type: FIXED_ARRAY(FIELD, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS) },
  { name: 'emittedLength', type: U32 },
  { name: 'contractAddress', type: AZTEC_ADDRESS },
]);

const CONTRACT_CLASS_LOGS: TypeMapping<ContractClassLogData[]> = FIXED_ARRAY(
  CONTRACT_CLASS_LOG_ENTRY,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
);

export const TX_EFFECT: TypeMapping<TxEffectData> = STRUCT<TxEffectData>([
  { name: 'revertCode', type: REVERT_CODE },
  { name: 'txHash', type: TX_HASH },
  { name: 'transactionFee', type: FIELD },
  { name: 'noteHashes', type: FIXED_ARRAY(FIELD, MAX_NOTE_HASHES_PER_TX) },
  { name: 'nullifiers', type: FIXED_ARRAY(FIELD, MAX_NULLIFIERS_PER_TX) },
  { name: 'l2ToL1Msgs', type: FIXED_ARRAY(FIELD, MAX_L2_TO_L1_MSGS_PER_TX) },
  { name: 'publicDataWrites', type: FIXED_ARRAY(PUBLIC_DATA_WRITE, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) },
  { name: 'privateLogs', type: FIXED_ARRAY(PRIVATE_LOG, MAX_PRIVATE_LOGS_PER_TX) },
  { name: 'publicLogs', type: FLAT_PUBLIC_LOGS },
  { name: 'contractClassLogs', type: CONTRACT_CLASS_LOGS },
]);

export const NOTE: TypeMapping<NoteData> = {
  serialization: {
    fn: noteData =>
      packAsHintedNote({
        contractAddress: noteData.contractAddress,
        owner: noteData.owner,
        randomness: noteData.randomness,
        storageSlot: noteData.storageSlot,
        noteNonce: noteData.noteNonce,
        isPending: noteData.isPending,
        note: noteData.note,
      }),
  },
  // A packed note is the note's (variable-count) field items followed by 6 metadata scalars, emitted as one field
  // output per element. Its length depends on the note, so it is described as a single variable-width run.
  shape: ['variable'],
};

export const NOTE_VALIDATION_REQUEST: TypeMapping<NoteValidationRequest> = {
  deserialization: {
    fn: ([reader]) => NoteValidationRequest.fromFields(reader),
  },
  shape: ['variable'],
};

export const EVENT_VALIDATION_REQUEST: TypeMapping<EventValidationRequest> = {
  deserialization: {
    fn: ([reader]) => EventValidationRequest.fromFields(reader),
  },
  shape: ['variable'],
};

export const LOG_RETRIEVAL_REQUEST: TypeMapping<LogRetrievalRequest> = STRUCT<LogRetrievalRequest>([
  { name: 'contractAddress', type: AZTEC_ADDRESS },
  { name: 'tag', type: TAG },
  { name: 'source', type: LOG_SOURCE },
  { name: 'fromBlock', type: OPTION(BLOCK_NUMBER) },
  { name: 'toBlock', type: OPTION(BLOCK_NUMBER) },
]);

export const LOG_RETRIEVAL_RESPONSE: TypeMapping<LogRetrievalResponse> = STRUCT<LogRetrievalResponse>([
  { name: 'logPayload', type: FIXED_BOUNDED_VEC(FIELD, PRIVATE_LOG_CIPHERTEXT_LEN) },
  { name: 'txHash', type: TX_HASH },
  { name: 'uniqueNoteHashesInTx', type: FIXED_BOUNDED_VEC(FIELD, MAX_NOTE_HASHES_PER_TX) },
  { name: 'firstNullifierInTx', type: FIELD },
  { name: 'blockNumber', type: BLOCK_NUMBER },
  { name: 'blockHash', type: BLOCK_HASH },
]);

// Legacy shape for the `getLogsByTagV2` oracle. Kept so already-deployed contracts keep working. New versions use
// `LOG_RETRIEVAL_RESPONSE` (used by `getLogsByTagV3`).
export const LEGACY_LOG_RETRIEVAL_RESPONSE_V2: TypeMapping<LegacyLogRetrievalResponseV2> =
  STRUCT<LegacyLogRetrievalResponseV2>([
    { name: 'logPayload', type: FIXED_BOUNDED_VEC(FIELD, PRIVATE_LOG_CIPHERTEXT_LEN) },
    { name: 'txHash', type: TX_HASH },
    { name: 'uniqueNoteHashesInTx', type: FIXED_BOUNDED_VEC(FIELD, MAX_NOTE_HASHES_PER_TX) },
    { name: 'firstNullifierInTx', type: FIELD },
    { name: 'blockNumber', type: BLOCK_NUMBER },
    { name: 'blockTimestamp', type: BIGINT },
  ]);

export const RESOLVED_TX: TypeMapping<ResolvedTx> = {
  serialization: { fn: resolved => [resolved.toFields()] },
  shape: [{ len: MAX_NOTE_HASHES_PER_TX + 5 }],
};

export const PENDING_TAGGED_LOG: TypeMapping<PendingTaggedLog> = STRUCT<PendingTaggedLog>([
  { name: 'log', type: FIXED_BOUNDED_VEC(FIELD, PRIVATE_LOG_SIZE_IN_FIELDS) },
  { name: 'context', type: RESOLVED_TX },
]);

// Block-less transaction context: the prefix of `RESOLVED_TX` carried by the original `getPendingTaggedLogs` oracle.
// Kept only for backwards compatibility, no longer used in new versions.
export const MESSAGE_CONTEXT: TypeMapping<MessageContext> = STRUCT<MessageContext>([
  { name: 'txHash', type: TX_HASH },
  { name: 'uniqueNoteHashesInTx', type: FIXED_BOUNDED_VEC(FIELD, MAX_NOTE_HASHES_PER_TX) },
  { name: 'firstNullifierInTx', type: FIELD },
]);

// Legacy shape for the original `getPendingTaggedLogs` oracle. New versions use `PENDING_TAGGED_LOG` (used by
// `getPendingTaggedLogsV2`).
export const LEGACY_PENDING_TAGGED_LOG: TypeMapping<LegacyPendingTaggedLog> = STRUCT<LegacyPendingTaggedLog>([
  { name: 'log', type: FIXED_BOUNDED_VEC(FIELD, PRIVATE_LOG_SIZE_IN_FIELDS) },
  { name: 'context', type: MESSAGE_CONTEXT },
]);

export const ORIGIN_BLOCK: TypeMapping<OriginBlock> = {
  serialization: { fn: ob => [new Fr(ob.blockNumber), ob.blockHash] },
  deserialization: {
    fn: ([blockNumberReader, blockHashReader]) => ({
      blockNumber: blockNumberReader.readField().toNumber(),
      blockHash: blockHashReader.readField(),
    }),
  },
  shape: ['scalar', 'scalar'],
};

/** Read-side origin of a retractable fact, carrying the chain state of its origin block. */
export const RETRACTABLE_FACT_ORIGIN: TypeMapping<RetractableFactOrigin> = {
  serialization: { fn: o => [new Fr(o.blockNumber), o.blockHash, new Fr(o.blockState)] },
  shape: ['scalar', 'scalar', 'scalar'],
};

// `facts` and `payload` each materialize to a single service-slot id, so a Fact occupies: factTypeId, the payload
// array slot, and `OPTION(RETRACTABLE_FACT_ORIGIN)` (its discriminant plus RETRACTABLE_FACT_ORIGIN's three slots).
export const FACT: TypeMapping<Fact> = {
  serialization: {
    fn: f => [
      f.factTypeId,
      f.payload.materializeSlot(v => FIELD.serialization!.fn(v).flat() as Fr[]),
      ...OPTION(RETRACTABLE_FACT_ORIGIN).serialization!.fn(f.originBlock),
    ],
  },
  shape: ['scalar', 'scalar', 'scalar', 'scalar', 'scalar', 'scalar'],
};

export const FACT_COLLECTION: TypeMapping<FactCollection> = {
  serialization: {
    fn: c => [
      c.contractAddress.toField(),
      c.scope.toField(),
      c.factCollectionTypeId,
      c.factCollectionId,
      c.facts.materializeSlot(v => FACT.serialization!.fn(v).flat() as Fr[]),
    ],
  },
  shape: ['scalar', 'scalar', 'scalar', 'scalar', 'scalar'],
};

export const PROVIDED_SECRET: TypeMapping<ProvidedSecret> = {
  deserialization: {
    fn: ([reader]) => ({
      secret: reader.readField(),
      mode: appTaggingSecretKindFromDeliveryMode(BYTE.deserialization!.fn([reader])),
    }),
  },
  shape: [{ len: 2 }],
};

// ─── Combinator Type Mappings ────────────────────────────────────────────────

function SIBLING_PATH<N extends number>(height: N): TypeMapping<SiblingPath<N>> {
  return {
    serialization: { fn: sp => [sp.toFields()] },
    shape: [{ len: height }],
  };
}

export function MEMBERSHIP_WITNESS<N extends number>(height: N): TypeMapping<MembershipWitness<N>> {
  return STRUCT<MembershipWitness<N>>([
    { name: 'leafIndex', type: BIGINT },
    { name: 'siblingPath', type: FIXED_ARRAY(FIELD, height) },
  ]);
}

export function ARRAY<T>(inner: TypeMapping<T>): TypeMapping<T[]> & { kind: 'array'; inner: TypeMapping<T> } {
  return {
    kind: 'array',
    inner,
    serialization: inner.serialization ? { fn: values => [packElements(inner, values)] } : undefined,
    deserialization: inner.deserialization
      ? {
          // The whole slot is the array, so read as many elements as its fields hold.
          fn: ([reader]) => unpackElements(inner, reader, reader.remainingFields() / fieldWidth(inner.shape)),
        }
      : undefined,
    // One slot of variable length (all elements flattened into it).
    shape: [{ lenFrom: (size: { length: number }) => size.length * fieldWidth(inner.shape) }],
  };
}

/**
 * Noir's fixed-length array `[T; maxLength]` in one slot: serializes `values` (each flattened via `element`)
 * zero-padded to exactly `maxLength * elementWidth` fields, and deserializes all `maxLength` elements back. An absent
 * element is the zero encoding, so the padding is derived from the shape.
 */
function FIXED_ARRAY<T>(element: TypeMapping<T>, maxLength: number): TypeMapping<T[]> {
  const elementWidth = fieldWidth(element.shape);
  return {
    serialization: element.serialization
      ? { fn: values => [padArrayEnd(packElements(element, values), Fr.ZERO, maxLength * elementWidth)] }
      : undefined,
    deserialization: element.deserialization
      ? { fn: ([reader]) => unpackElements(element, reader, maxLength) }
      : undefined,
    shape: [{ len: maxLength * elementWidth }],
  };
}

/**
 * Maps Noir's `BoundedVec<T, MaxLen>` ↔ TS `BoundedVec<T>` over 2 slots:
 *   slot 0 — flat storage, padded/parsed as `maxLength * elementSize` fields
 *   slot 1 — length scalar (count of actual items)
 *
 * Both directions are derived from `element`: bidirectional iff `element` has both serialization and deserialization.
 *
 * @example Serializing `BoundedVec.from({ data: [0x41, 0x42], maxLength: 4 })` with `BOUNDED_VEC(BYTE)`:
 * ```
 * slot 0: [Fr(0x41), Fr(0x42), Fr(0), Fr(0)]     // data padded to maxLength
 * slot 1: Fr(2)                                  // actual length
 * ```
 */
export function BOUNDED_VEC<T>(
  inner: TypeMapping<T>,
): TypeMapping<BoundedVec<T>> & { kind: 'bounded-vec'; inner: TypeMapping<T> } {
  return {
    kind: 'bounded-vec',
    inner,
    serialization: inner.serialization
      ? {
          fn: bv => {
            if (bv.data.length > bv.maxLength) {
              throw new Error(`Got ${bv.data.length} items, but maxLength is ${bv.maxLength}`);
            }
            // Fixed-width elements take their width from the shape (consistent with deserialization); only a
            // variable-width element (e.g. a packed note) falls back to the runtime `elementSize` the value carries.
            const elementWidth = tryFieldWidth(inner.shape) ?? bv.elementSize;
            const flat = padArrayEnd(packElements(inner, bv.data), Fr.ZERO, bv.maxLength * elementWidth);
            return [flat, new Fr(bv.data.length)];
          },
        }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: ([storageReader, lengthReader]) => {
            // slot 0 is the padded storage, slot 1 the actual length. Parse only the first `length` elements out of
            // storage, then drain the trailing zero-padding so the storage reader is fully consumed.
            const maxLength = storageReader.remainingFields() / fieldWidth(inner.shape);
            const length = lengthReader.readField().toNumber();
            const elements = unpackElements(inner, storageReader, length);
            storageReader.skip(storageReader.remainingFields());
            return BoundedVec.from<T>({ data: elements, maxLength });
          },
        }
      : undefined,
    // slot 0: variable-length storage; slot 1: the length scalar.
    shape: [{ lenFrom: (size: { maxLength: number }) => size.maxLength * fieldWidth(inner.shape) }, 'scalar'],
  };
}

/**
 * Noir's `BoundedVec<T, MaxLen>` in its padded form (one fixed-width slot): `maxLength * elementWidth` storage fields
 * (zero-padded) followed by the actual length, with no length prefix, so the width is statically known. Serialize-only.
 * Throws if the input exceeds `maxLength`.
 */
export function FIXED_BOUNDED_VEC<T>(element: TypeMapping<T>, maxLength: number): TypeMapping<T[]> {
  const width = fieldWidth(element.shape);
  return {
    serialization: element.serialization
      ? {
          fn: values => {
            if (values.length > maxLength) {
              throw new Error(`Got ${values.length} items, but maxLength is ${maxLength}`);
            }
            const flat = padArrayEnd(packElements(element, values), Fr.ZERO, maxLength * width);
            return [[...flat, new Fr(values.length)]];
          },
        }
      : undefined,
    shape: [{ len: maxLength * width + 1 }],
  };
}

/**
 * Wraps an inner TypeMapping in Noir-style `Option<T>`, adding a leading discriminant slot.
 *
 * For the `None` case, the inner's slots must still be present on the wire as zero-padding (so `Some` and `None` have
 * identical size). That padding is derived entirely from `inner.shape`.
 *
 * @example Serializing `Option.some(AztecAddress.fromFieldUnsafe(Fr(42)))` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(1)    // discriminant: Some
 * slot 1: Fr(42)   // inner value
 * ```
 *
 * @example Serializing `Option.none()` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(0)    // discriminant: None
 * slot 1: Fr(0)    // zero-filled from AZTEC_ADDRESS.shape
 * ```
 */
export function OPTION<T>(inner: TypeMapping<T>): TypeMapping<Option<T>> & { kind: 'option'; inner: TypeMapping<T> } {
  return {
    kind: 'option',
    inner,
    serialization: inner.serialization
      ? {
          fn: opt =>
            opt.isSome()
              ? [Fr.ONE, ...inner.serialization!.fn(opt.value)]
              : [Fr.ZERO, ...zeroSlotsFromShape(inner.shape, opt.size)],
        }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: ([discriminant, ...innerReaders]) => {
            if (discriminant.readField().isZero()) {
              // None still carries the inner's zero-padded slots; consume them without parsing, since an inner that
              // validates its fields would reject the zeros.
              innerReaders.forEach(reader => reader.skip(reader.remainingFields()));
              return Option.none<T>();
            }
            return Option.some(inner.deserialization!.fn(innerReaders));
          },
        }
      : undefined,
    // A leading discriminant slot followed by the inner's slots.
    shape: ['scalar', ...inner.shape],
  };
}

/**
 * A fixed packed uint buffer (Noir `[u8; length]` at `bitSize` 8): one slot of `length` packed uint values ↔ `Buffer`.
 * `length` is the field count, which equals the byte count at `bitSize` 8.
 */
export function BUFFER(bitSize: number, length: number): TypeMapping<Buffer> {
  return {
    serialization: {
      fn: buf => [Array.from(buf).map(b => new Fr(b))],
    },
    deserialization: {
      fn: ([reader]) =>
        fromUintArray(
          reader.readFieldArray(length).map(f => f.toString()),
          bitSize,
        ),
    },
    shape: [{ len: length }],
  };
}

export function EPHEMERAL_ARRAY<T>(element: TypeMapping<T>): TypeMapping<EphemeralArray<T>> {
  // EphemeralArray.readAll hands each row's flat fields in as a single reader; reconstruct the element's per-slot
  // readers from its shape, deserialize, and assert the row was fully consumed so a row with trailing fields is
  // rejected.
  const rowElement: TypeMapping<T> | undefined = element.deserialization
    ? {
        deserialization: {
          fn: ([rowReader]) => deserializeElement(element, rowReader.readFieldArray(rowReader.remainingFields())),
        },
        // `fn` reads the whole row from one reader, so this is one variable-width slot, not the element's multi-slot
        // shape.
        shape: ['variable'],
      }
    : undefined;
  return {
    serialization: element.serialization
      ? { fn: ea => [ea.materializeSlot(v => serializeElement(element, v))] }
      : undefined,
    deserialization: rowElement
      ? { fn: ([reader]) => EphemeralArray.fromSlot(reader.readField(), rowElement) }
      : undefined,
    // A single slot carrying the array's service-slot id.
    shape: ['scalar'],
  };
}

/** A named field within a {@link STRUCT}: it owns however many wire slots its {@link TypeMapping} declares. */
type StructField<TName extends string = string, T = any> = { name: TName; type: TypeMapping<T> };

/**
 * A Noir struct: its `shape` and (de)serialization are the concatenation of its fields', so callers never hand-write a
 * `shape`. `T` is the struct's TS value type and must match the field layout — serialization reads each field by name
 * off the value, deserialization returns the decoded bag as `T`; convert in the handler, not here, when `T` differs.
 */
export function STRUCT<T>(fields: readonly StructField[]): TypeMapping<T> {
  return {
    serialization: fields.every(f => f.type.serialization)
      ? {
          fn: (value: T) => {
            const props = value as any;
            return fields.flatMap(f => f.type.serialization!.fn(props[f.name]));
          },
        }
      : undefined,
    deserialization: fields.every(f => f.type.deserialization)
      ? {
          fn: readers => {
            const props: Record<string, unknown> = {};
            let slot = 0;
            for (const f of fields) {
              const slotCount = f.type.shape.length;
              props[f.name] = f.type.deserialization!.fn(readers.slice(slot, slot + slotCount));
              slot += slotCount;
            }
            return props as T;
          },
        }
      : undefined,
    shape: fields.flatMap(f => f.type.shape),
  };
}

/** Number of InputSlots a deserializable type spans, derived from its {@link TypeMapping.shape}. */
export function slotsOf(mapping: TypeMapping): number {
  return mapping.shape.length;
}

/** Number of fields a fully-static shape occupies, or `undefined` if any slot is variable-width. */
function tryFieldWidth(shape: SlotShape[]): number | undefined {
  let total = 0;
  for (const slot of shape) {
    if (slot === 'scalar') {
      total += 1;
    } else if (typeof slot === 'object' && 'len' in slot) {
      total += slot.len;
    } else {
      return undefined;
    }
  }
  return total;
}

/** Number of fields a fully-static shape occupies. Throws on a variable-width shape, whose field count isn't known. */
function fieldWidth(shape: SlotShape[]): number {
  const width = tryFieldWidth(shape);
  if (width === undefined) {
    throw new Error('Cannot compute a fixed field width for a variable-width shape');
  }
  return width;
}

/** Reconstructs a value's per-slot readers from a flat run of fields, using its shape (inverse of slot-flattening). */
function splitByShape(fields: Fr[], shape: SlotShape[]): FieldReader[] {
  const readers: FieldReader[] = [];
  let cursor = 0;
  shape.forEach((slot, i) => {
    if (slot === 'scalar' || (typeof slot === 'object' && 'len' in slot)) {
      const width = slot === 'scalar' ? 1 : slot.len;
      if (cursor + width > fields.length) {
        throw new Error(`Not enough fields to reconstruct shape: needed ${width}, had ${fields.length - cursor}`);
      }
      readers.push(new FieldReader(fields.slice(cursor, cursor + width)));
      cursor += width;
    } else {
      // A variable slot (sized or not) takes whatever remains, so it must be last.
      if (i !== shape.length - 1) {
        throw new Error('A variable-width slot must be last to be reconstructed from a flat field array');
      }
      readers.push(new FieldReader(fields.slice(cursor)));
      cursor = fields.length;
    }
  });
  if (cursor !== fields.length) {
    throw new Error(`Malformed flattened value: ${fields.length - cursor} unexpected trailing field(s)`);
  }
  return readers;
}

/** Serializes one element to its flat fields. Element must be serializable. */
function serializeElement<T>(element: TypeMapping<T>, value: T): Fr[] {
  return element.serialization!.fn(value).flat();
}

/**
 * Deserializes one element from its exact flat fields, reconstructing its per-slot readers from its shape and asserting
 * they are fully consumed (so trailing fields are rejected). Element must be deserializable.
 */
function deserializeElement<T>(element: TypeMapping<T>, fields: Fr[]): T {
  const readers = splitByShape(fields, element.shape);
  const value = element.deserialization!.fn(readers);
  assertReadersConsumed(readers);
  return value;
}

/** Flattens `values` into one contiguous run of fields by serializing each element. Element must be serializable. */
function packElements<T>(element: TypeMapping<T>, values: T[]): Fr[] {
  return values.flatMap(v => serializeElement(element, v));
}

/**
 * Reads `count` fixed-width elements out of a packed run (the inverse of {@link packElements}). Element must be
 * deserializable.
 */
function unpackElements<T>(element: TypeMapping<T>, reader: FieldReader, count: number): T[] {
  const elementWidth = fieldWidth(element.shape);
  return Array.from({ length: count }, () => deserializeElement(element, reader.readFieldArray(elementWidth)));
}

/** Builds the zero-filled slots for a `None`, matching a `Some`'s wire shape (variable slots sized from `size`). */
function zeroSlotsFromShape(shape: SlotShape[], size: unknown): (Fr | Fr[])[] {
  return shape.map(slot => {
    if (slot === 'scalar') {
      return Fr.ZERO;
    }
    if (slot === 'variable') {
      throw new Error('Cannot zero-fill an unsized variable-width slot');
    }
    if ('len' in slot) {
      return Array<Fr>(slot.len).fill(Fr.ZERO);
    }
    if (size === undefined) {
      throw new Error(
        'Serializing Option.none() over a variable-size inner needs a size, e.g. Option.none({ length: n })',
      );
    }
    return Array<Fr>(slot.lenFrom(size)).fill(Fr.ZERO);
  });
}
