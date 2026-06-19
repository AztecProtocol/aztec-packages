/* eslint-disable camelcase */
import {
  GAS_SETTINGS_LENGTH,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { withHexPrefix, withoutHexPrefix } from '@aztec/foundation/string';
import {
  ARRAY,
  AZTEC_ADDRESS,
  BIGINT,
  BLOCK_NUMBER,
  BOOL,
  FIELD,
  FUNCTION_SELECTOR,
  type InputSlot,
  type MaybePromise,
  OPTION,
  ORACLE_REGISTRY,
  type OracleRegistryEntry,
  type ParamTypes,
  STR,
  TAGGING_SECRET_SOURCE,
  type TypeMapping,
  U32,
  makeEntry,
} from '@aztec/pxe/simulator';
import { EventSelector } from '@aztec/stdlib/abi';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { GasSettings } from '@aztec/stdlib/gas';
import { PrivateContextInputs } from '@aztec/stdlib/kernel';
import type { PrivateLog } from '@aztec/stdlib/logs';
import type { TxHash } from '@aztec/stdlib/tx';

import {
  MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY,
  MAX_OFFCHAIN_EFFECT_LEN,
  MAX_PRIVATE_EVENTS_PER_TXE_QUERY,
  MAX_PRIVATE_EVENT_LEN,
} from '../constants.js';
import type { ForeignCallArgs, ForeignCallResult } from '../utils/encoding.js';

const GAS_SETTINGS: TypeMapping<GasSettings> = {
  serialization: { fn: v => v.toFields() },
  deserialization: {
    fn: ([reader]) => GasSettings.fromFields(reader.readFieldArray(GAS_SETTINGS_LENGTH)),
    slots: 1,
  },
};

const PRIVATE_CONTEXT_INPUTS: TypeMapping<PrivateContextInputs> = {
  serialization: { fn: v => v.toFields() },
};

const COMPLETE_ADDRESS: TypeMapping<CompleteAddress> = {
  serialization: { fn: v => [v.address.toField(), ...v.publicKeys.toFields()] },
};

const TXE_TX_EFFECTS: TypeMapping<{
  txHash: TxHash;
  noteHashes: Fr[];
  nullifiers: Fr[];
  privateLogs: PrivateLog[];
}> = {
  serialization: {
    fn: ({ txHash, noteHashes, nullifiers, privateLogs }) => {
      const emittedLogs = privateLogs.map(log => log.getEmittedFields());
      const rawLogStorage = emittedLogs
        .map(fields => fields.concat(Array(PRIVATE_LOG_SIZE_IN_FIELDS - fields.length).fill(Fr.ZERO)))
        .concat(
          Array(MAX_PRIVATE_LOGS_PER_TX - emittedLogs.length).fill(Array(PRIVATE_LOG_SIZE_IN_FIELDS).fill(Fr.ZERO)),
        )
        .flat();
      const logLengths = emittedLogs
        .map(fields => new Fr(fields.length))
        .concat(Array(MAX_PRIVATE_LOGS_PER_TX - emittedLogs.length).fill(Fr.ZERO));
      const paddedNoteHashes = noteHashes.concat(Array(MAX_NOTE_HASHES_PER_TX - noteHashes.length).fill(Fr.ZERO));
      const paddedNullifiers = nullifiers.concat(Array(MAX_NULLIFIERS_PER_TX - nullifiers.length).fill(Fr.ZERO));

      return [
        txHash.hash,
        paddedNoteHashes,
        new Fr(noteHashes.length),
        paddedNullifiers,
        new Fr(nullifiers.length),
        rawLogStorage,
        logLengths,
        new Fr(emittedLogs.length),
      ] as (Fr | Fr[])[];
    },
  },
};

const TXE_OFFCHAIN_EFFECTS: TypeMapping<{ effects: Fr[][] }> = {
  serialization: {
    fn: ({ effects }) => {
      const rawArrayStorage = effects
        .map(e => e.concat(Array(MAX_OFFCHAIN_EFFECT_LEN - e.length).fill(Fr.ZERO)))
        .concat(
          Array(MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY - effects.length).fill(Array(MAX_OFFCHAIN_EFFECT_LEN).fill(Fr.ZERO)),
        )
        .flat();
      const effectLengths = effects
        .map(e => new Fr(e.length))
        .concat(Array(MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY - effects.length).fill(Fr.ZERO));

      return [rawArrayStorage, effectLengths, new Fr(effects.length)] as (Fr | Fr[])[];
    },
  },
};

const TXE_CALL_CONTEXT: TypeMapping<{ txHash: Fr; anchorBlockTimestamp: bigint }> = {
  serialization: {
    fn: ({ txHash, anchorBlockTimestamp }) => {
      const isSome = txHash.isZero() ? 0 : 1;
      return [new Fr(isSome), txHash, new Fr(anchorBlockTimestamp)];
    },
  },
};

const CONTRACT_INSTANCE_MEMBER: TypeMapping<{ member: Fr; exists: boolean }> = {
  serialization: { fn: ({ member, exists }) => [member, new Fr(exists)] },
};

const EVENT_SELECTOR: TypeMapping<EventSelector> = {
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => EventSelector.fromField(reader.readField()), slots: 1 },
};

const TXE_PRIVATE_EVENTS: TypeMapping<Fr[][]> = {
  serialization: {
    fn: events => {
      const rawArrayStorage = events
        .map(e => e.concat(Array(MAX_PRIVATE_EVENT_LEN - e.length).fill(Fr.ZERO)))
        .concat(
          Array(MAX_PRIVATE_EVENTS_PER_TXE_QUERY - events.length).fill(Array(MAX_PRIVATE_EVENT_LEN).fill(Fr.ZERO)),
        )
        .flat();
      const eventLengths = events
        .map(e => new Fr(e.length))
        .concat(Array(MAX_PRIVATE_EVENTS_PER_TXE_QUERY - events.length).fill(Fr.ZERO));
      return [rawArrayStorage, eventLengths, new Fr(events.length)] as (Fr | Fr[])[];
    },
  },
};

export const TXE_ORACLE_REGISTRY = {
  ...ORACLE_REGISTRY,

  aztec_txe_assertCompatibleOracleVersion: makeEntry({
    params: [
      { name: 'major', type: U32 },
      { name: 'minor', type: U32 },
    ],
  }),

  aztec_txe_setTopLevelTXEContext: makeEntry(),

  aztec_txe_setPrivateTXEContext: makeEntry({
    params: [
      { name: 'contractAddress', type: OPTION(AZTEC_ADDRESS) },
      { name: 'anchorBlockNumber', type: OPTION(BLOCK_NUMBER) },
      { name: 'gasSettings', type: GAS_SETTINGS },
    ],
    returnType: PRIVATE_CONTEXT_INPUTS,
  }),

  aztec_txe_setPublicTXEContext: makeEntry({
    params: [{ name: 'contractAddress', type: OPTION(AZTEC_ADDRESS) }],
  }),

  aztec_txe_setUtilityTXEContext: makeEntry({
    params: [{ name: 'contractAddress', type: OPTION(AZTEC_ADDRESS) }],
  }),

  aztec_txe_getDefaultAddress: makeEntry({ returnType: AZTEC_ADDRESS }),

  aztec_txe_getNextBlockNumber: makeEntry({ returnType: BLOCK_NUMBER }),

  aztec_txe_getNextBlockTimestamp: makeEntry({ returnType: BIGINT }),

  aztec_txe_advanceBlocksBy: makeEntry({
    params: [{ name: 'blocks', type: U32 }],
  }),

  aztec_txe_advanceTimestampBy: makeEntry({
    params: [{ name: 'duration', type: BIGINT }],
  }),

  aztec_txe_deploy: makeEntry({
    params: [
      { name: 'contractPath', type: STR },
      { name: 'initializer', type: STR },
      { name: 'argsLength', type: U32 },
      { name: 'args', type: ARRAY(FIELD) },
      { name: 'secret', type: FIELD },
      { name: 'salt', type: FIELD },
      { name: 'deployer', type: AZTEC_ADDRESS },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_txe_createAccount: makeEntry({
    params: [{ name: 'secret', type: FIELD }],
    returnType: COMPLETE_ADDRESS,
  }),

  aztec_txe_addAccount: makeEntry({
    params: [{ name: 'secret', type: FIELD }],
    returnType: COMPLETE_ADDRESS,
  }),

  aztec_txe_addAuthWitness: makeEntry({
    params: [
      { name: 'address', type: AZTEC_ADDRESS },
      { name: 'messageHash', type: FIELD },
    ],
  }),

  aztec_txe_setTaggingSecretSource: makeEntry({
    params: [{ name: 'source', type: OPTION(TAGGING_SECRET_SOURCE) }],
  }),

  aztec_txe_getLastBlockTimestamp: makeEntry({
    returnType: BIGINT,
  }),

  aztec_txe_getLastTxEffects: makeEntry({ returnType: TXE_TX_EFFECTS }),
  aztec_txe_getLastCallOffchainEffects: makeEntry({ returnType: TXE_OFFCHAIN_EFFECTS }),
  aztec_txe_getLastCallContext: makeEntry({ returnType: TXE_CALL_CONTEXT }),

  aztec_txe_getPrivateEvents: makeEntry({
    params: [
      { name: 'selector', type: EVENT_SELECTOR },
      { name: 'contractAddress', type: AZTEC_ADDRESS },
      { name: 'scope', type: AZTEC_ADDRESS },
    ],
    returnType: TXE_PRIVATE_EVENTS,
  }),

  aztec_txe_privateCallNewFlow: makeEntry({
    params: [
      { name: 'from', type: OPTION(AZTEC_ADDRESS) },
      { name: 'targetContractAddress', type: AZTEC_ADDRESS },
      { name: 'functionSelector', type: FUNCTION_SELECTOR },
      { name: 'args', type: ARRAY(FIELD) },
      { name: 'argsHash', type: FIELD },
      { name: 'isStaticCall', type: BOOL },
      { name: 'additionalScopes', type: ARRAY(AZTEC_ADDRESS) },
      { name: 'authorizedUtilityCallTargets', type: ARRAY(AZTEC_ADDRESS) },
      { name: 'gasSettings', type: GAS_SETTINGS },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_txe_executeUtilityFunction: makeEntry({
    params: [
      { name: 'targetContractAddress', type: AZTEC_ADDRESS },
      { name: 'functionSelector', type: FUNCTION_SELECTOR },
      { name: 'args', type: ARRAY(FIELD) },
      { name: 'authorizedUtilityCallTargets', type: ARRAY(AZTEC_ADDRESS) },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_txe_publicCallNewFlow: makeEntry({
    params: [
      { name: 'from', type: OPTION(AZTEC_ADDRESS) },
      { name: 'address', type: AZTEC_ADDRESS },
      { name: 'calldata', type: ARRAY(FIELD) },
      { name: 'isStaticCall', type: BOOL },
      { name: 'gasSettings', type: GAS_SETTINGS },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_avm_address: makeEntry({ returnType: AZTEC_ADDRESS }),

  aztec_avm_sender: makeEntry({ returnType: AZTEC_ADDRESS }),

  aztec_avm_blockNumber: makeEntry({ returnType: BLOCK_NUMBER }),

  aztec_avm_timestamp: makeEntry({ returnType: BIGINT }),

  aztec_avm_isStaticCall: makeEntry({ returnType: BOOL }),

  aztec_avm_chainId: makeEntry({ returnType: FIELD }),

  aztec_avm_version: makeEntry({ returnType: FIELD }),

  aztec_avm_emitNullifier: makeEntry({
    params: [{ name: 'nullifier', type: FIELD }],
  }),

  aztec_avm_emitNoteHash: makeEntry({
    params: [{ name: 'noteHash', type: FIELD }],
  }),

  aztec_avm_nullifierExists: makeEntry({
    params: [{ name: 'siloedNullifier', type: FIELD }],
    returnType: BOOL,
  }),

  aztec_avm_storageRead: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'contractAddress', type: AZTEC_ADDRESS },
    ],
    returnType: FIELD,
  }),

  aztec_avm_storageWrite: makeEntry({
    params: [
      { name: 'slot', type: FIELD },
      { name: 'value', type: FIELD },
    ],
  }),

  aztec_avm_emitPublicLog: makeEntry({
    params: [{ name: 'message', type: ARRAY(FIELD) }],
  }),

  aztec_avm_returndataSize: makeEntry({ returnType: FIELD }),

  aztec_avm_returndataCopy: makeEntry({
    params: [
      { name: 'rdOffset', type: U32 },
      { name: 'copySize', type: U32 },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_avm_call: makeEntry({
    params: [
      { name: 'l2Gas', type: U32 },
      { name: 'daGas', type: U32 },
      { name: 'address', type: AZTEC_ADDRESS },
      { name: 'argsLength', type: U32 },
      { name: 'args', type: ARRAY(FIELD) },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_avm_staticCall: makeEntry({
    params: [
      { name: 'l2Gas', type: U32 },
      { name: 'daGas', type: U32 },
      { name: 'address', type: AZTEC_ADDRESS },
      { name: 'argsLength', type: U32 },
      { name: 'args', type: ARRAY(FIELD) },
    ],
    returnType: ARRAY(FIELD),
  }),

  aztec_avm_successCopy: makeEntry({ returnType: FIELD }),

  aztec_avm_getContractInstanceDeployer: makeEntry({
    params: [{ name: 'address', type: AZTEC_ADDRESS }],
    returnType: CONTRACT_INSTANCE_MEMBER,
  }),
  aztec_avm_getContractInstanceClassId: makeEntry({
    params: [{ name: 'address', type: AZTEC_ADDRESS }],
    returnType: CONTRACT_INSTANCE_MEMBER,
  }),
  aztec_avm_getContractInstanceInitializationHash: makeEntry({
    params: [{ name: 'address', type: AZTEC_ADDRESS }],
    returnType: CONTRACT_INSTANCE_MEMBER,
  }),
  aztec_avm_getContractInstanceImmutablesHash: makeEntry({
    params: [{ name: 'address', type: AZTEC_ADDRESS }],
    returnType: CONTRACT_INSTANCE_MEMBER,
  }),
} satisfies Record<string, OracleRegistryEntry>;

export function toInputSlots(inputs: ForeignCallArgs): InputSlot[] {
  // TXE foreign calls use bare hex strings, but Fr.fromString requires a 0x prefix to parse as hex.
  return inputs.map(v => (Array.isArray(v) ? (v as string[]).map(withHexPrefix) : [withHexPrefix(v as string)]));
}

/**
 * Deserializes oracle inputs, calls the handler with typed params, serializes the result, and wraps
 * it in a `ForeignCallResult`. Normalizes `ForeignCallArgs` (which may contain bare strings) into
 * `InputSlot[]` (always arrays) before deserialization.
 */
export async function callTxeHandler<K extends keyof typeof TXE_ORACLE_REGISTRY>({
  oracle,
  inputs,
  handler,
}: {
  oracle: K;
  inputs: ForeignCallArgs;
  handler: (
    params: ParamTypes<ReturnType<(typeof TXE_ORACLE_REGISTRY)[K]['deserializeParams']>>,
  ) => MaybePromise<Parameters<(typeof TXE_ORACLE_REGISTRY)[K]['serializeReturn']>[0]>;
}): Promise<ForeignCallResult> {
  const entry = TXE_ORACLE_REGISTRY[oracle] as OracleRegistryEntry;
  const named = entry.deserializeParams(toInputSlots(inputs));
  const positional = named.map((p: { value: unknown }) => p.value);
  const result = await handler(positional as any);
  const outputSlots = entry.serializeReturn(result);
  return {
    values: outputSlots.map(slot => (Array.isArray(slot) ? slot.map(withoutHexPrefix) : withoutHexPrefix(slot))),
  };
}
