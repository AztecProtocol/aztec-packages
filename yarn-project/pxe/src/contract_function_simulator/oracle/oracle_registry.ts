/* eslint-disable camelcase */
import {
  ARCHIVE_HEIGHT,
  BLOCK_HEADER_LENGTH,
  KEY_VALIDATION_REQUEST_LENGTH,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
} from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import { type ACVMField, fromUintArray, toACVMField } from '@aztec/simulator/client';
import { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import type { ContractInstance, PartialAddress } from '@aztec/stdlib/contract';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { ContractClassLog, ContractClassLogFields, FlatPublicLogs, PrivateLog, Tag } from '@aztec/stdlib/logs';
import { NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import { BlockHeader, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { BoundedVec } from '../noir-structs/bounded_vec.js';
import { Option } from '../noir-structs/option.js';
import { UtilityContext } from '../noir-structs/utility_context.js';
import type { NoteData } from './interfaces.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';
import { packAsHintedNote } from './note_packing_utils.js';

const FIELD: TypeMapping<Fr> = {
  serialization: { fn: v => [v] },
  deserialization: { fn: ([reader]) => reader.readField(), slots: 1 },
};

const BOOL: TypeMapping<boolean> = {
  serialization: { fn: v => [new Fr(v ? 1n : 0n)] },
  deserialization: { fn: ([reader]) => !reader.readField().isZero(), slots: 1 },
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
    slots: 1,
  },
};

const BLOCK_NUMBER: TypeMapping<BlockNumber> = {
  serialization: { fn: v => [new Fr(v)] },
  deserialization: { fn: ([reader]) => BlockNumber(reader.readField().toNumber()), slots: 1 },
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
    slots: 1,
  },
};

/** Reads every field in the slot as a UTF-8 character code. */
const STR: TypeMapping<string> = {
  serialization: { fn: str => [Array.from(Buffer.from(str, 'utf-8')).map(b => new Fr(b))] },
  deserialization: {
    fn: ([reader]) => {
      const chars: string[] = [];
      while (!reader.isFinished()) {
        chars.push(String.fromCharCode(reader.readField().toNumber()));
      }
      return chars.join('');
    },
    slots: 1,
  },
};

const AZTEC_ADDRESS: TypeMapping<AztecAddress> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => AztecAddress.fromField(reader.readField()), slots: 1 },
};

const BLOCK_HASH: TypeMapping<BlockHash> = {
  serialization: { fn: v => [new Fr(v.toBuffer())] },
  deserialization: { fn: ([reader]) => new BlockHash(reader.readField()), slots: 1 },
};

const FUNCTION_SELECTOR: TypeMapping<FunctionSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => FunctionSelector.fromField(reader.readField()), slots: 1 },
};

const NOTE_SELECTOR: TypeMapping<NoteSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => NoteSelector.fromField(reader.readField()), slots: 1 },
};

const TX_HASH: TypeMapping<TxHash> = {
  serialization: { fn: v => [v.hash] },
  deserialization: { fn: ([reader]) => TxHash.fromField(reader.readField()), slots: 1 },
};

const TAG: TypeMapping<Tag> = {
  serialization: { fn: v => [v.value] },
  deserialization: { fn: ([reader]) => new Tag(reader.readField()), slots: 1 },
};

const BLOCK_HEADER: TypeMapping<BlockHeader> = {
  serialization: { fn: v => v.toFields() },
  deserialization: { fn: ([reader]) => BlockHeader.fromFields(reader.readFieldArray(BLOCK_HEADER_LENGTH)), slots: 1 },
};

const KEY_VALIDATION_REQUEST: TypeMapping<KeyValidationRequest> = {
  serialization: { fn: v => v.toFields() },
  deserialization: {
    fn: ([reader]) => KeyValidationRequest.fromFields(reader.readFieldArray(KEY_VALIDATION_REQUEST_LENGTH)),
    slots: 1,
  },
};

const CONTRACT_INSTANCE: TypeMapping<ContractInstance> = {
  serialization: {
    fn: v => [
      v.salt,
      v.deployer.toField(),
      v.currentContractClassId,
      v.initializationHash,
      v.immutablesHash,
      ...v.publicKeys.toFields(),
    ],
  },
};

const NULLIFIER_MEMBERSHIP_WITNESS: TypeMapping<NullifierMembershipWitness> = {
  serialization: {
    fn: (w: NullifierMembershipWitness) =>
      w
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
};

const PUBLIC_DATA_WITNESS: TypeMapping<PublicDataWitness> = {
  serialization: {
    fn: (w: PublicDataWitness) =>
      w
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
};

const MESSAGE_LOAD_ORACLE_INPUTS: TypeMapping<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> = {
  serialization: {
    fn: (m: MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>) =>
      m
        .toNoirRepresentation()
        .map(slot => (Array.isArray(slot) ? slot.map(s => Fr.fromString(s)) : Fr.fromString(slot as string))),
  },
};

const UTILITY_CONTEXT: TypeMapping<UtilityContext> = {
  serialization: {
    fn: (ctx: UtilityContext) => [...ctx.blockHeader.toFields(), ctx.contractAddress.toField()],
  },
};

const CALL_PRIVATE_RESULT: TypeMapping<{ endSideEffectCounter: Fr; returnsHash: Fr }> = {
  serialization: { fn: v => [[v.endSideEffectCounter, v.returnsHash]] },
};

const PUBLIC_KEYS_AND_PARTIAL_ADDRESS: TypeMapping<{
  publicKeys: PublicKeys;
  partialAddress: PartialAddress;
}> = {
  serialization: {
    fn: v => [[...v.publicKeys.toFields(), v.partialAddress]],
  },
};

const CONTRACT_CLASS_LOG_INPUT: TypeMapping<ContractClassLog> = {
  deserialization: {
    fn: ([addrReader, fieldsReader, lengthReader]) => {
      const addr = AztecAddress.fromField(addrReader.readField());
      const fields = new ContractClassLogFields([...fieldsReader.readFieldArray(fieldsReader.remainingFields())]);
      const length = lengthReader.readField().toNumber();
      return new ContractClassLog(addr, fields, length);
    },
    // ContractClassLog input occupies 3 ACVM slots: [contractAddress], [message fields...], [length].
    slots: 3,
  },
};

const TX_EFFECT: TypeMapping<TxEffect> = {
  serialization: {
    fn: (effect: TxEffect) => {
      const flatPublicLogs = FlatPublicLogs.fromLogs(effect.publicLogs);
      return [
        effect.revertCode.toField(),
        effect.txHash.hash,
        effect.transactionFee,
        padArrayEnd(effect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
        padArrayEnd(effect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
        padArrayEnd(effect.l2ToL1Msgs, Fr.ZERO, MAX_L2_TO_L1_MSGS_PER_TX),
        padArrayEnd(
          effect.publicDataWrites,
          PublicDataWrite.empty(),
          MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        ).flatMap(w => w.toFields()),
        padArrayEnd(effect.privateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX).flatMap(l => l.toFields()),
        new Fr(flatPublicLogs.length),
        flatPublicLogs.payload,
        padArrayEnd(effect.contractClassLogs, ContractClassLog.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX).flatMap(l => [
          ...l.fields.toFields(),
          new Fr(l.emittedLength),
          l.contractAddress.toField(),
        ]),
      ] as (Fr | Fr[])[];
    },
  },
};

const NOTE: TypeMapping<NoteData> = {
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
};

const ORACLE_REGISTRY = {
  aztec_utl_assertCompatibleOracleVersion: makeEntry({
    params: [
      { name: 'major', type: U32 },
      { name: 'minor', type: U32 },
    ],
  }),

  aztec_utl_getRandomField: makeEntry({ returnType: FIELD }),

  aztec_utl_log: makeEntry({
    params: [
      { name: 'level', type: U32 },
      { name: 'message', type: STR },
      { name: 'fieldsSize', type: U32 },
      { name: 'fields', type: ARRAY(FIELD) },
    ],
  }),

  aztec_utl_getUtilityContext: makeEntry({ returnType: UTILITY_CONTEXT }),

  aztec_utl_getKeyValidationRequest: makeEntry({
    params: [{ name: 'pkMHash', type: FIELD }],
    returnType: KEY_VALIDATION_REQUEST,
  }),

  aztec_utl_getContractInstance: makeEntry({
    params: [{ name: 'address', type: AZTEC_ADDRESS }],
    returnType: CONTRACT_INSTANCE,
  }),

  aztec_utl_getNoteHashMembershipWitness: makeEntry({
    params: [
      { name: 'anchorBlockHash', type: BLOCK_HASH },
      { name: 'noteHash', type: FIELD },
    ],
    returnType: MEMBERSHIP_WITNESS(NOTE_HASH_TREE_HEIGHT),
  }),

  aztec_utl_getBlockHashMembershipWitness: makeEntry({
    params: [
      { name: 'anchorBlockHash', type: BLOCK_HASH },
      { name: 'blockHash', type: BLOCK_HASH },
    ],
    returnType: OPTION(MEMBERSHIP_WITNESS(ARCHIVE_HEIGHT)),
  }),

  aztec_utl_getNullifierMembershipWitness: makeEntry({
    params: [
      { name: 'blockHash', type: BLOCK_HASH },
      { name: 'nullifier', type: FIELD },
    ],
    returnType: NULLIFIER_MEMBERSHIP_WITNESS,
  }),

  aztec_utl_getLowNullifierMembershipWitness: makeEntry({
    params: [
      { name: 'blockHash', type: BLOCK_HASH },
      { name: 'nullifier', type: FIELD },
    ],
    returnType: NULLIFIER_MEMBERSHIP_WITNESS,
  }),

  aztec_utl_getPublicDataWitness: makeEntry({
    params: [
      { name: 'blockHash', type: BLOCK_HASH },
      { name: 'leafSlot', type: FIELD },
    ],
    returnType: PUBLIC_DATA_WITNESS,
  }),

  aztec_utl_getBlockHeader: makeEntry({
    params: [{ name: 'blockNumber', type: BLOCK_NUMBER }],
    returnType: BLOCK_HEADER,
  }),

  aztec_utl_getAuthWitness: makeEntry({
    params: [{ name: 'messageHash', type: FIELD }],
    returnType: ARRAY(FIELD),
  }),

  aztec_utl_getPublicKeysAndPartialAddress: makeEntry({
    params: [{ name: 'address', type: AZTEC_ADDRESS }],
    returnType: OPTION(PUBLIC_KEYS_AND_PARTIAL_ADDRESS),
  }),

  aztec_utl_doesNullifierExist: makeEntry({
    params: [{ name: 'innerNullifier', type: FIELD }],
    returnType: BOOL,
  }),

  aztec_utl_getL1ToL2MembershipWitness: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'messageHash', type: FIELD },
      { name: 'secret', type: FIELD },
    ],
    returnType: MESSAGE_LOAD_ORACLE_INPUTS,
  }),

  aztec_utl_getFromPublicStorage: makeEntry({
    params: [
      { name: 'blockHash', type: BLOCK_HASH },
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'startStorageSlot', type: FIELD },
      { name: 'numberOfElements', type: U32 },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_utl_getNotes: makeEntry({
    params: [
      { name: 'owner', type: OPTION(AZTEC_ADDRESS) },
      { name: 'storageSlot', type: FIELD },
      { name: 'numSelects', type: U32 },
      { name: 'selectByIndexes', type: ARRAY(U32) },
      { name: 'selectByOffsets', type: ARRAY(U32) },
      { name: 'selectByLengths', type: ARRAY(U32) },
      { name: 'selectValues', type: ARRAY(FIELD) },
      { name: 'selectComparators', type: ARRAY(U32) },
      { name: 'sortByIndexes', type: ARRAY(U32) },
      { name: 'sortByOffsets', type: ARRAY(U32) },
      { name: 'sortByLengths', type: ARRAY(U32) },
      { name: 'sortOrder', type: ARRAY(U32) },
      { name: 'limit', type: U32 },
      { name: 'offset', type: U32 },
      { name: 'status', type: U32 },
      { name: 'maxNotes', type: U32 },
      { name: 'packedHintedNoteLength', type: U32 },
    ],
    returnType: BOUNDED_VEC(NOTE),
  }),

  aztec_utl_getPendingTaggedLogs: makeEntry({
    params: [{ name: 'scope', type: AZTEC_ADDRESS }],
    returnType: FIELD,
  }),

  aztec_utl_validateAndStoreEnqueuedNotesAndEvents: makeEntry({
    params: [
      { name: 'noteValidationRequestsArrayBaseSlot', type: FIELD },
      { name: 'eventValidationRequestsArrayBaseSlot', type: FIELD },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
  }),

  aztec_utl_getLogsByTag: makeEntry({
    params: [{ name: 'requestArrayBaseSlot', type: FIELD }],
    returnType: FIELD,
  }),

  aztec_utl_getMessageContextsByTxHash: makeEntry({
    params: [{ name: 'requestArrayBaseSlot', type: FIELD }],
    returnType: FIELD,
  }),

  aztec_utl_getTxEffect: makeEntry({
    params: [{ name: 'txHash', type: TX_HASH }],
    returnType: OPTION(TX_EFFECT),
  }),

  aztec_utl_setCapsule: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'slot', type: FIELD },
      { name: 'capsule', type: ARRAY(FIELD) },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
  }),

  aztec_utl_getCapsule: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'slot', type: FIELD },
      { name: 'tSize', type: U32 },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
    returnType: OPTION(ARRAY(FIELD)),
  }),

  aztec_utl_deleteCapsule: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'slot', type: FIELD },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
  }),

  aztec_utl_copyCapsule: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'srcSlot', type: FIELD },
      { name: 'dstSlot', type: FIELD },
      { name: 'numEntries', type: U32 },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
  }),

  aztec_utl_decryptAes128: makeEntry({
    params: [
      { name: 'ciphertext', type: BOUNDED_VEC(BYTE) },
      { name: 'iv', type: BUFFER(8) },
      { name: 'symKey', type: BUFFER(8) },
    ],
    returnType: OPTION(BOUNDED_VEC(BYTE)),
  }),

  aztec_utl_getSharedSecrets: makeEntry({
    params: [
      { name: 'address', type: AZTEC_ADDRESS },
      { name: 'ephPksSlot', type: FIELD },
      { name: 'contractAddress', type: AZTEC_ADDRESS },
    ],
    returnType: FIELD,
  }),

  aztec_utl_setContractSyncCacheInvalid: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'scopes', type: BOUNDED_VEC(AZTEC_ADDRESS) },
    ],
  }),

  aztec_utl_emitOffchainEffect: makeEntry({
    params: [{ name: 'data', type: ARRAY(FIELD) }],
  }),

  aztec_utl_callUtilityFunction: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'functionSelector', type: FUNCTION_SELECTOR },
      { name: 'args', type: ARRAY(FIELD) },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_utl_pushEphemeral: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'elements', type: ARRAY(FIELD) },
    ],
    returnType: U32,
  }),

  aztec_utl_popEphemeral: makeEntry({
    params: [{ name: 'slot', type: FIELD }],
    returnType: ARRAY(FIELD),
  }),

  aztec_utl_getEphemeral: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'index', type: U32 },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_utl_setEphemeral: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'index', type: U32 },
      { name: 'elements', type: ARRAY(FIELD) },
    ],
  }),

  aztec_utl_getEphemeralLen: makeEntry({
    params: [{ name: 'slot', type: FIELD }],
    returnType: U32,
  }),

  aztec_utl_removeEphemeral: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'index', type: U32 },
    ],
  }),

  aztec_utl_clearEphemeral: makeEntry({
    params: [{ name: 'slot', type: FIELD }],
  }),

  aztec_prv_setHashPreimage: makeEntry({
    params: [
      { name: 'values', type: ARRAY(FIELD) },
      { name: 'hash', type: FIELD },
    ],
  }),

  aztec_prv_getHashPreimage: makeEntry({
    params: [{ name: 'returnsHash', type: FIELD }],
    returnType: ARRAY(FIELD),
  }),

  aztec_prv_notifyCreatedNote: makeEntry({
    params: [
      { name: 'owner', type: AZTEC_ADDRESS },
      { name: 'storageSlot', type: FIELD },
      { name: 'randomness', type: FIELD },
      { name: 'noteTypeId', type: NOTE_SELECTOR },
      { name: 'note', type: ARRAY(FIELD) },
      { name: 'noteHash', type: FIELD },
      { name: 'counter', type: U32 },
    ],
  }),

  aztec_prv_notifyNullifiedNote: makeEntry({
    params: [
      { name: 'innerNullifier', type: FIELD },
      { name: 'noteHash', type: FIELD },
      { name: 'counter', type: U32 },
    ],
  }),

  aztec_prv_notifyCreatedNullifier: makeEntry({
    params: [{ name: 'innerNullifier', type: FIELD }],
  }),

  aztec_prv_isNullifierPending: makeEntry({
    params: [
      { name: 'innerNullifier', type: FIELD },
      { name: 'contractAddress', type: AZTEC_ADDRESS },
    ],
    returnType: BOOL,
  }),

  aztec_prv_notifyCreatedContractClassLog: makeEntry({
    params: [
      { name: 'log', type: CONTRACT_CLASS_LOG_INPUT },
      { name: 'counter', type: U32 },
    ],
  }),

  aztec_prv_callPrivateFunction: makeEntry({
    params: [
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'functionSelector', type: FUNCTION_SELECTOR },
      { name: 'argsHash', type: FIELD },
      { name: 'sideEffectCounter', type: U32 },
      { name: 'isStaticCall', type: BOOL },
    ],
    returnType: CALL_PRIVATE_RESULT,
  }),

  aztec_prv_assertValidPublicCalldata: makeEntry({
    params: [{ name: 'calldataHash', type: FIELD }],
  }),

  aztec_prv_notifyRevertiblePhaseStart: makeEntry({
    params: [{ name: 'minRevertibleSideEffectCounter', type: U32 }],
  }),

  aztec_prv_isExecutionInRevertiblePhase: makeEntry({
    params: [{ name: 'sideEffectCounter', type: U32 }],
    returnType: BOOL,
  }),

  aztec_prv_getNextAppTagAsSender: makeEntry({
    params: [
      { name: 'sender', type: AZTEC_ADDRESS },
      { name: 'recipient', type: AZTEC_ADDRESS },
    ],
    returnType: TAG,
  }),

  aztec_prv_getNextConstrainedTaggingIndex: makeEntry({
    params: [{ name: 'appSiloedSecret', type: FIELD }],
    returnType: U32,
  }),

  aztec_prv_getSenderForTags: makeEntry({ returnType: OPTION(AZTEC_ADDRESS) }),

  aztec_prv_setSenderForTags: makeEntry({
    params: [{ name: 'senderForTags', type: AZTEC_ADDRESS }],
  }),
} satisfies Record<string, OracleRegistryEntry>;

/**
 * Deserializes oracle inputs, calls the handler with typed params, and serializes the result.
 */
export async function callHandler<K extends keyof typeof ORACLE_REGISTRY>({
  oracle,
  inputs,
  handler,
}: {
  oracle: K;
  inputs: InputSlot[];
  handler: (
    params: ParamTypes<ReturnType<(typeof ORACLE_REGISTRY)[K]['deserializeParams']>>,
  ) => MaybePromise<Parameters<(typeof ORACLE_REGISTRY)[K]['serializeReturn']>[0]>;
}): Promise<OutputSlot[]> {
  const entry = ORACLE_REGISTRY[oracle] as OracleRegistryEntry;
  const named = entry.deserializeParams(inputs);
  const positional = named.map(p => p.value);
  const result = await handler(positional as any);
  return entry.serializeReturn(result);
}

// ─── Helper Types ─────────────────────────────────────────────────────────────

/** One ACVM input slot: an array of hex-encoded field strings. */
type InputSlot = ACVMField[];

/** One ACVM output slot: a scalar hex string or an array of hex strings. */
type OutputSlot = ACVMField | ACVMField[];

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
    /** Read a typed value from one FieldReader per consumed slot. */
    fn: (readers: FieldReader[]) => T;
    /**
     * Number of InputSlots this type reads from. `deserialization.fn` receives one FieldReader per slot in `readers`.
     *
     * Examples:
     * - `FIELD`, `U32`, `AZTEC_ADDRESS` — single slot         → `slots: 1`
     * - `OPTION(T)` — discriminant + inner slots              → `slots: T.slots + 1`
     * - `CONTRACT_CLASS_LOG_INPUT` — [addr], [fields], [len]  → `slots: 3`
     */
    slots: number;
  };
}

/**
 * A full oracle registry entry describing param and return serialization.
 *
 * TDeserializedParams — the array of named pairs returned by `deserializeParams`.
 * TReturnValue — the typed handler return value consumed by `serializeReturn`.
 */
interface OracleRegistryEntry<
  TDeserializedParams extends readonly NamedValue[] = readonly NamedValue[],
  TReturnValue = any,
> {
  /** Deserialize all ACVM inputs into named pairs in positional order. */
  deserializeParams(inputs: InputSlot[]): TDeserializedParams;
  /** Serialize a handler return value into ACVM output slots. */
  serializeReturn(result: TReturnValue): OutputSlot[];
}

function makeEntry<const TParams extends RegistryParam[] = [], TReturnValue = void>({
  params,
  returnType,
}: {
  params?: [...TParams];
  returnType?: TypeMapping<TReturnValue>;
} = {}): OracleRegistryEntry<InferDeserializedParams<TParams>, TReturnValue> {
  return {
    deserializeParams(inputs: InputSlot[]): InferDeserializedParams<TParams> {
      const resolvedParams: RegistryParam[] = params ?? [];
      // Walk the input slots left-to-right, advancing by each param's slot count.
      let offset = 0;
      return resolvedParams.map(param => {
        if (!param.type.deserialization) {
          throw new Error(`Param '${param.name}' has no deserialization defined`);
        }
        // Collect the slots for this param and wrap each in a FieldReader.
        const slotCount = param.type.deserialization.slots;
        const readers = inputs
          .slice(offset, offset + slotCount)
          .map(slot => new FieldReader(slot.map(hex => Fr.fromString(hex))));
        offset += slotCount;
        // Delegate to the TypeMapping's deserializer and tag the result with the param name.
        return { name: param.name, value: param.type.deserialization.fn(readers) };
      }) as unknown as InferDeserializedParams<TParams>;
    },
    serializeReturn(result: TReturnValue): OutputSlot[] {
      if (returnType?.serialization === undefined) {
        return [];
      }
      return returnType.serialization
        .fn(result)
        .map(slot => (Array.isArray(slot) ? slot.map(toACVMField) : toACVMField(slot)));
    },
  };
}

/** `_height` is unused at runtime but lets TypeScript infer the exact `N` for `MembershipWitness<N>`. */
function MEMBERSHIP_WITNESS<N extends number>(_height: N): TypeMapping<MembershipWitness<N>> {
  return {
    serialization: {
      fn: (witness: MembershipWitness<N>) => [new Fr(witness.leafIndex), [...witness.siblingPath]],
    },
  };
}

function ARRAY<T>(element: TypeMapping<T>): TypeMapping<T[]> {
  return {
    serialization: element.serialization
      ? { fn: values => [values.flatMap(v => element.serialization!.fn(v).flat())] }
      : undefined,
    deserialization: element.deserialization
      ? {
          fn: ([reader]) => {
            const result: T[] = [];
            while (!reader.isFinished()) {
              result.push(element.deserialization!.fn([reader]));
            }
            return result;
          },
          slots: 1,
        }
      : undefined,
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
function BOUNDED_VEC<T>(element: TypeMapping<T>): TypeMapping<BoundedVec<T>> {
  return {
    serialization: element.serialization
      ? {
          fn: bv => {
            if (bv.data.length > bv.maxLength) {
              throw new Error(`Got ${bv.data.length} items, but maxLength is ${bv.maxLength}`);
            }
            const flat = bv.data.flatMap(item => element.serialization!.fn(item).flat());
            return [padArrayEnd(flat, Fr.ZERO, bv.maxLength * bv.elementSize), new Fr(bv.data.length)];
          },
        }
      : undefined,
    deserialization: element.deserialization
      ? {
          fn: ([storageReader, lengthReader]) => {
            const maxLength = storageReader.remainingFields();
            const length = lengthReader.readField().toNumber();
            const elements: T[] = [];
            for (let i = 0; i < length; i++) {
              elements.push(element.deserialization!.fn([storageReader]));
            }
            return BoundedVec.from<T>({ data: elements, maxLength });
          },
          slots: 2,
        }
      : undefined,
  };
}

/**
 * Wraps an inner TypeMapping in Noir-style `Option<T>`. Adds a discriminant slot and uses the handler-provided
 * `Option.none(shape)` template to produce a correctly-sized zero-filled output for the None case.
 *
 * @example Serializing `Option.some(AztecAddress.fromField(Fr(42)))` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(1)    // discriminant: Some
 * slot 1: Fr(42)   // inner value
 * ```
 *
 * @example Serializing `Option.empty(AztecAddress.ZERO)` with `OPTION(AZTEC_ADDRESS)`:
 * ```
 * slot 0: Fr(0)    // discriminant: None
 * slot 1: Fr(0)    // zero-filled using shape
 * ```
 */
function OPTION<T>(inner: TypeMapping<T>): TypeMapping<Option<T>> {
  return {
    serialization: inner.serialization
      ? {
          fn: opt => {
            if (opt.isSome()) {
              return [Fr.ONE, ...inner.serialization!.fn(opt.value)];
            }
            if (opt.template === undefined) {
              throw new Error(
                'Cannot serialize Option.empty() without an emptyTemplate — provide one via Option.empty(emptyTemplate)',
              );
            }
            const zeroSlots = inner
              .serialization!.fn(opt.template)
              .map(s => (Array.isArray(s) ? Array(s.length).fill(Fr.ZERO) : Fr.ZERO));
            return [Fr.ZERO, ...zeroSlots];
          },
        }
      : undefined,
    deserialization: inner.deserialization
      ? {
          fn: readers => {
            if (readers[0].readField().isZero()) {
              return Option.none<T>(undefined as unknown as T);
            }
            return Option.some(inner.deserialization!.fn(readers.slice(1)));
          },
          slots: inner.deserialization.slots + 1,
        }
      : undefined,
  };
}

/** A packed uint buffer (e.g. `[u8; N]` in Noir): 1 slot of packed uint values ↔ `Buffer`. */
function BUFFER(bitSize: number): TypeMapping<Buffer> {
  return {
    serialization: {
      fn: buf => [Array.from(buf).map(b => new Fr(b))],
    },
    deserialization: {
      fn: ([reader]) => {
        const fields = reader.readFieldArray(reader.remainingFields()).map(f => f.toString());
        return fromUintArray(fields, bitSize);
      },
      slots: 1,
    },
  };
}

/** A named oracle parameter with its TypeMapping. */
interface RegistryParam<TName extends string = string, T = any> {
  name: TName;
  type: TypeMapping<T>;
}

/** One named param entry from a deserializeParams result. */
type NamedValue<TName extends string = string, TValue = any> = { readonly name: TName; readonly value: TValue };

/**
 * Extracts the positional type tuple from a {@link OracleRegistryEntry.deserializeParams} result,
 * stripping names to produce the handler's argument types.
 *
 * @example `ParamTypes<[NamedValue<'addr', AztecAddress>, NamedValue<'slot', Fr>]>` → `[AztecAddress, Fr]`
 */
type ParamTypes<T extends readonly NamedValue[]> = {
  [K in keyof T]: T[K] extends NamedValue<string, infer V> ? V : never;
};

/**
 * Maps a registry entry's `params` declaration to the return type of
 * {@link OracleRegistryEntry.deserializeParams}: each `RegistryParam<Name, Type>` becomes a
 * `NamedValue<Name, Type>` at the same position.
 *
 * @example `InferDeserializedParams<[RegistryParam<'addr', AztecAddress>, RegistryParam<'slot', Fr>]>`
 *        → `[NamedValue<'addr', AztecAddress>, NamedValue<'slot', Fr>]`
 */
type InferDeserializedParams<T extends RegistryParam[]> = {
  [K in keyof T]: T[K] extends RegistryParam<infer N, infer V> ? NamedValue<N, V> : never;
};

type MaybePromise<T> = T | Promise<T>;
