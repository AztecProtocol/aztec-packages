/* eslint-disable camelcase */
import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
  PRIVATE_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { withHexPrefix, withoutHexPrefix } from '@aztec/foundation/string';
import type { TaggingSecretStrategy } from '@aztec/pxe/server';
import {
  ARRAY,
  AZTEC_ADDRESS,
  BLOCK_NUMBER,
  BOOL,
  ETH_ADDRESS,
  FIELD,
  FIXED_ARRAY,
  FIXED_BOUNDED_VEC,
  FUNCTION_SELECTOR,
  GAS_FEES,
  type InputSlot,
  LEAF,
  type MaybePromise,
  OPTION,
  ORACLE_REGISTRY,
  type Option,
  type OracleRegistryEntry,
  type OutputSlot,
  PUBLIC_KEYS,
  type ParamTypes,
  SCALAR,
  STR,
  STRUCT,
  type SlotShape,
  type TypeMapping,
  U32,
  U64,
  buildACIRCallback,
  makeEntry,
} from '@aztec/pxe/simulator';
import { EventSelector } from '@aztec/stdlib/abi';
import { CompleteAddress } from '@aztec/stdlib/contract';
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
import type { GasData, GasSettingsData } from './noir-structs/gas_settings_data.js';

// Spreading `ORACLE_REGISTRY` re-materializes its entries into `TXE_ORACLE_REGISTRY`'s inferred type, which names the
// protocol types below. Re-exporting them gives tsc a portable path to each instead of falling back to a deep
// node_modules path that breaks .d.ts portability (TS2742).
export type { ContractClassLogData, EmbeddedCurvePoint, TxEffectData } from '@aztec/pxe/simulator';
export type { BlockHash } from '@aztec/stdlib/block';
export type { MembershipWitness } from '@aztec/foundation/trees';
export type { NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';

const GAS: TypeMapping<GasData> = STRUCT([
  { name: 'daGas', type: U32 },
  { name: 'l2Gas', type: U32 },
]);

const GAS_SETTINGS: TypeMapping<GasSettingsData> = STRUCT([
  { name: 'gasLimits', type: GAS },
  { name: 'teardownGasLimits', type: GAS },
  { name: 'maxFeesPerGas', type: GAS_FEES },
  { name: 'maxPriorityFeesPerGas', type: GAS_FEES },
]);

// Tagging secret strategy discriminants. Must match the Noir test helper `TaggingSecretStrategy` in
// aztec-nr `test/helpers/tagging_secret_strategy.nr`. This is a test-only oracle (only `set_tagging_secret_strategies`
// reads it), so the mapping lives here on the TXE side rather than in the production oracle type mappings.
const STRATEGY_NON_INTERACTIVE_HANDSHAKE = 1;
const STRATEGY_ARBITRARY_SECRET = 2;
const STRATEGY_ADDRESS_DERIVED = 3;
const STRATEGY_INTERACTIVE_HANDSHAKE = 4;

const TAGGING_SECRET_STRATEGY: TypeMapping<TaggingSecretStrategy> = LEAF({
  kind: 'tagging-secret-strategy',
  serialization: {
    fn: strategy => {
      switch (strategy.type) {
        case 'non-interactive-handshake':
          return [new Fr(STRATEGY_NON_INTERACTIVE_HANDSHAKE), Fr.ZERO, Fr.ZERO];
        case 'interactive-handshake':
          return [new Fr(STRATEGY_INTERACTIVE_HANDSHAKE), Fr.ZERO, Fr.ZERO];
        case 'address-derived':
          return [new Fr(STRATEGY_ADDRESS_DERIVED), Fr.ZERO, Fr.ZERO];
        case 'arbitrary-secret':
          return [new Fr(STRATEGY_ARBITRARY_SECRET), strategy.secret.x, strategy.secret.y];
      }
    },
  },
  deserialization: {
    fn: ([kindReader, xReader, yReader]) => {
      const kind = kindReader.readField().toNumber();
      const [x, y] = [xReader.readField(), yReader.readField()];
      switch (kind) {
        case STRATEGY_NON_INTERACTIVE_HANDSHAKE:
          return { type: 'non-interactive-handshake' };
        case STRATEGY_INTERACTIVE_HANDSHAKE:
          return { type: 'interactive-handshake' };
        case STRATEGY_ADDRESS_DERIVED:
          return { type: 'address-derived' };
        case STRATEGY_ARBITRARY_SECRET:
          return { type: 'arbitrary-secret', secret: Point.fromFields([x, y]) };
        default:
          throw new Error(`Unrecognized tagging secret strategy kind: ${kind}`);
      }
    },
  },
  shape: ['scalar', 'scalar', 'scalar'],
});

const PRIVATE_CONTEXT_INPUTS: TypeMapping<PrivateContextInputs> = LEAF({
  kind: 'private-context-inputs',
  serialization: { fn: v => v.toFields() },
  shape: Array<SlotShape>(PRIVATE_CONTEXT_INPUTS_LENGTH).fill('scalar'),
});

const COMPLETE_ADDRESS: TypeMapping<CompleteAddress> = STRUCT([
  { name: 'address', type: AZTEC_ADDRESS },
  { name: 'publicKeys', type: PUBLIC_KEYS },
]);

const TXE_TX_EFFECTS: TypeMapping<{
  txHash: TxHash;
  noteHashes: Fr[];
  nullifiers: Fr[];
  privateLogs: PrivateLog[];
}> = LEAF({
  kind: 'txe-tx-effects',
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
  // txHash, padded note hashes + count, padded nullifiers + count, flattened private-log storage + lengths + count.
  shape: [
    'scalar',
    { len: MAX_NOTE_HASHES_PER_TX },
    'scalar',
    { len: MAX_NULLIFIERS_PER_TX },
    'scalar',
    { len: MAX_PRIVATE_LOGS_PER_TX * PRIVATE_LOG_SIZE_IN_FIELDS },
    { len: MAX_PRIVATE_LOGS_PER_TX },
    'scalar',
  ],
});

const TXE_OFFCHAIN_EFFECTS: TypeMapping<Fr[][]> = FIXED_BOUNDED_VEC(
  FIXED_BOUNDED_VEC(FIELD, MAX_OFFCHAIN_EFFECT_LEN),
  MAX_OFFCHAIN_EFFECTS_PER_TXE_QUERY,
);

const TXE_CALL_CONTEXT: TypeMapping<{ txHash: Option<Fr>; anchorBlockTimestamp: bigint }> = STRUCT([
  { name: 'txHash', type: OPTION(FIELD) },
  { name: 'anchorBlockTimestamp', type: U64 },
]);

const CONTRACT_INSTANCE_MEMBER: TypeMapping<{ exists: boolean; member: Fr }[]> = FIXED_ARRAY(
  STRUCT([
    { name: 'exists', type: BOOL },
    { name: 'member', type: FIELD },
  ]),
  1,
);

export const EVENT_SELECTOR: TypeMapping<EventSelector> = SCALAR({
  kind: 'event-selector',
  serialization: { fn: v => [v.toField()] },
  deserialization: { fn: ([reader]) => EventSelector.fromField(reader.readField()) },
});

const TXE_PRIVATE_EVENTS: TypeMapping<Fr[][]> = FIXED_BOUNDED_VEC(
  FIXED_BOUNDED_VEC(FIELD, MAX_PRIVATE_EVENT_LEN),
  MAX_PRIVATE_EVENTS_PER_TXE_QUERY,
);

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

  aztec_txe_getNextBlockTimestamp: makeEntry({ returnType: U64 }),

  aztec_txe_advanceBlocksBy: makeEntry({
    params: [{ name: 'blocks', type: U32 }],
  }),

  aztec_txe_advanceTimestampBy: makeEntry({
    params: [{ name: 'duration', type: U64 }],
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
    params: [
      { name: 'secret', type: FIELD },
      { name: 'partialAddress', type: FIELD },
    ],
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

  aztec_txe_sendL1ToL2Message: makeEntry({
    params: [
      { name: 'content', type: FIELD },
      { name: 'secretHash', type: FIELD },
      { name: 'sender', type: ETH_ADDRESS },
      { name: 'recipient', type: AZTEC_ADDRESS },
    ],
    returnType: FIELD,
  }),

  aztec_txe_setTaggingSecretStrategies: makeEntry({
    params: [
      { name: 'unconstrainedStrategy', type: OPTION(TAGGING_SECRET_STRATEGY) },
      { name: 'constrainedStrategy', type: OPTION(TAGGING_SECRET_STRATEGY) },
    ],
  }),

  aztec_txe_setAuthorizeAllUtilityCallTargets: makeEntry({
    params: [{ name: 'authorizeAll', type: BOOL }],
  }),

  aztec_txe_getLastBlockTimestamp: makeEntry({
    returnType: U64,
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
      { name: 'from', type: OPTION(AZTEC_ADDRESS) },
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

  aztec_avm_timestamp: makeEntry({ returnType: U64 }),

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

  aztec_avm_returndataSize: makeEntry({ returnType: U32 }),

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
  }),

  aztec_avm_staticCall: makeEntry({
    params: [
      { name: 'l2Gas', type: U32 },
      { name: 'daGas', type: U32 },
      { name: 'address', type: AZTEC_ADDRESS },
      { name: 'argsLength', type: U32 },
      { name: 'args', type: ARRAY(FIELD) },
    ],
  }),

  aztec_avm_successCopy: makeEntry({ returnType: BOOL }),

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
  return outputSlotsToForeignCallResult(entry.serializeReturn(result));
}

/**
 * Dispatches an oracle that has been retired into the PXE legacy registry. TXE has no explicit handler method for such
 * names; this runs them through the same `buildACIRCallback` legacy path that contract execution already uses, so
 * TXE's top-level oracle path and its in-contract path treat the legacy registry identically.
 */
const legacyCallbacksByHandler = new WeakMap<object, ReturnType<typeof buildACIRCallback>>();

export async function callTxeLegacyHandler(
  oracle: string,
  inputs: ForeignCallArgs,
  oracleHandler: Parameters<typeof buildACIRCallback>[0],
): Promise<ForeignCallResult> {
  // `buildACIRCallback` materializes the whole real+legacy closure set, so memoize it per handler rather than
  // rebuilding on every call (TXE routes one legacy oracle through here on each top-level discovery).
  let callback = legacyCallbacksByHandler.get(oracleHandler);
  if (!callback) {
    callback = buildACIRCallback(oracleHandler);
    legacyCallbacksByHandler.set(oracleHandler, callback);
  }
  const outputSlots = await callback[oracle](...toInputSlots(inputs));
  return outputSlotsToForeignCallResult(outputSlots);
}

/**
 * Strips the `0x` prefix from each serialized output slot (TXE foreign calls use bare hex strings) and wraps them in a
 * `ForeignCallResult`.
 */
function outputSlotsToForeignCallResult(outputSlots: OutputSlot[]): ForeignCallResult {
  return {
    values: outputSlots.map(slot => (Array.isArray(slot) ? slot.map(withoutHexPrefix) : withoutHexPrefix(slot))),
  };
}
