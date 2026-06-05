/* eslint-disable camelcase */
import { ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { toACVMField } from '@aztec/simulator/client';

import {
  ARRAY,
  AZTEC_ADDRESS,
  BLOCK_HASH,
  BLOCK_HEADER,
  BLOCK_NUMBER,
  BOOL,
  BOUNDED_VEC,
  BUFFER,
  BYTE,
  CALL_PRIVATE_RESULT,
  CONTRACT_CLASS_LOG_INPUT,
  CONTRACT_INSTANCE,
  DELIVERY_MODE,
  EPHEMERAL_ARRAY,
  EVENT_VALIDATION_REQUEST,
  FIELD,
  FUNCTION_SELECTOR,
  type InputSlot,
  KEY_VALIDATION_REQUEST,
  LOG_RETRIEVAL_REQUEST,
  LOG_RETRIEVAL_RESPONSE,
  MEMBERSHIP_WITNESS,
  MESSAGE_CONTEXT,
  MESSAGE_LOAD_ORACLE_INPUTS,
  type MaybePromise,
  NOTE,
  NOTE_SELECTOR,
  NOTE_VALIDATION_REQUEST,
  NULLIFIER_MEMBERSHIP_WITNESS,
  OPTION,
  type OutputSlot,
  PENDING_TAGGED_LOG,
  POINT,
  PROVIDED_SECRET,
  PUBLIC_DATA_WITNESS,
  PUBLIC_KEYS_AND_PARTIAL_ADDRESS,
  STR,
  TX_EFFECT,
  TX_HASH,
  type TypeMapping,
  U32,
  UTILITY_CONTEXT,
  assertReadersConsumed,
} from './oracle_type_mappings.js';

export {
  ARRAY,
  AZTEC_ADDRESS,
  BIGINT,
  BLOCK_NUMBER,
  BOOL,
  BOUNDED_VEC,
  BUFFER,
  BYTE,
  DELIVERY_MODE,
  EPHEMERAL_ARRAY,
  EVENT_VALIDATION_REQUEST,
  FIELD,
  FUNCTION_SELECTOR,
  LOG_RETRIEVAL_REQUEST,
  LOG_RETRIEVAL_RESPONSE,
  MEMBERSHIP_WITNESS,
  MESSAGE_CONTEXT,
  NOTE_VALIDATION_REQUEST,
  OPTION,
  PENDING_TAGGED_LOG,
  POINT,
  PROVIDED_SECRET,
  STR,
  U32,
  type InputSlot,
  type MaybePromise,
  type OutputSlot,
  type TypeMapping,
} from './oracle_type_mappings.js';

export const ORACLE_REGISTRY = {
  aztec_misc_assertCompatibleOracleVersion: makeEntry({
    params: [
      { name: 'major', type: U32 },
      { name: 'minor', type: U32 },
    ],
  }),

  aztec_misc_getRandomField: makeEntry({ returnType: FIELD }),

  aztec_misc_log: makeEntry({
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
    params: [
      { name: 'scope', type: AZTEC_ADDRESS },
      { name: 'providedSecrets', type: EPHEMERAL_ARRAY(PROVIDED_SECRET) },
    ],
    returnType: EPHEMERAL_ARRAY(PENDING_TAGGED_LOG),
  }),

  aztec_utl_validateAndStoreEnqueuedNotesAndEvents: makeEntry({
    params: [
      { name: 'noteValidationRequests', type: EPHEMERAL_ARRAY(NOTE_VALIDATION_REQUEST) },
      { name: 'eventValidationRequests', type: EPHEMERAL_ARRAY(EVENT_VALIDATION_REQUEST) },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
  }),

  aztec_utl_getLogsByTag: makeEntry({
    params: [{ name: 'requests', type: EPHEMERAL_ARRAY(LOG_RETRIEVAL_REQUEST) }],
    returnType: EPHEMERAL_ARRAY(EPHEMERAL_ARRAY(LOG_RETRIEVAL_RESPONSE)),
  }),

  aztec_utl_getMessageContextsByTxHash: makeEntry({
    params: [{ name: 'requests', type: EPHEMERAL_ARRAY(FIELD) }],
    returnType: EPHEMERAL_ARRAY(OPTION(MESSAGE_CONTEXT)),
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
      { name: 'ephPks', type: EPHEMERAL_ARRAY(POINT) },
      { name: 'contractAddress', type: AZTEC_ADDRESS },
    ],
    returnType: EPHEMERAL_ARRAY(FIELD),
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

  aztec_prv_getAppTaggingSecret: makeEntry({
    params: [
      { name: 'sender', type: AZTEC_ADDRESS },
      { name: 'recipient', type: AZTEC_ADDRESS },
    ],
    returnType: OPTION(FIELD),
  }),

  aztec_prv_getNextTaggingIndex: makeEntry({
    params: [
      { name: 'secret', type: FIELD },
      { name: 'deliveryMode', type: DELIVERY_MODE },
    ],
    returnType: U32,
  }),

  aztec_prv_getSenderForTags: makeEntry({ returnType: OPTION(AZTEC_ADDRESS) }),
} satisfies Record<string, OracleRegistryEntry>;

// ─── Registry Infrastructure ─────────────────────────────────────────────────

/**
 * A full oracle registry entry describing param and return serialization.
 *
 * TDeserializedParams — the array of named pairs returned by `deserializeParams`.
 * TReturnValue — the typed handler return value consumed by `serializeReturn`.
 */
export interface OracleRegistryEntry<
  TDeserializedParams extends readonly NamedValue[] = readonly NamedValue[],
  TReturnValue = any,
> {
  /** Deserialize all ACVM inputs into named pairs in positional order. */
  deserializeParams(inputs: InputSlot[]): TDeserializedParams;
  /** Serialize a handler return value into ACVM output slots. */
  serializeReturn(result: TReturnValue): OutputSlot[];
}

export function makeEntry<const TParams extends RegistryParam[] = [], TReturnValue = void>({
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
        // Delegate to the TypeMapping's deserializer, assert the param's slots are fully consumed, and tag the
        // result with the param name.
        const value = param.type.deserialization.fn(readers);
        assertReadersConsumed(readers);
        return { name: param.name, value };
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

/** A named oracle parameter with its TypeMapping. */
interface RegistryParam<TName extends string = string, T = any> {
  name: TName;
  type: TypeMapping<T>;
}

/** One named param entry from a deserializeParams result. */
export type NamedValue<TName extends string = string, TValue = any> = { readonly name: TName; readonly value: TValue };

/**
 * Extracts the positional type tuple from a {@link OracleRegistryEntry.deserializeParams} result,
 * stripping names to produce the handler's argument types.
 *
 * @example `ParamTypes<[NamedValue<'addr', AztecAddress>, NamedValue<'slot', Fr>]>` → `[AztecAddress, Fr]`
 */
export type ParamTypes<T extends readonly NamedValue[]> = {
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

// ─── Derived Handler Interfaces ─────────────────────────────────────────────

/** Strips the `aztec_{scope}_` prefix from an oracle key to get the handler method name. */
export type StripOraclePrefix<K extends string> = K extends `aztec_${string}_${infer M}` ? M : never;

/** Derives the handler function signature from a registry entry's deserialization/serialization types. */
type HandlerFn<E extends OracleRegistryEntry> = (
  ...args: ParamTypes<ReturnType<E['deserializeParams']>>
) => MaybePromise<Parameters<E['serializeReturn']>[0]>;

/** Collects all oracle handler methods for a given name prefix into a single object type. */
export type HandlersForPrefix<R extends Record<string, OracleRegistryEntry>, P extends string> = {
  [K in keyof R as K extends `aztec_${P}_${string}` ? StripOraclePrefix<K & string> : never]: HandlerFn<R[K]>;
};
