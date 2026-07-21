/* eslint-disable camelcase */
import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
<<<<<<< HEAD

import type { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import type { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
=======
import { computeFeeJuiceMessageNullifier } from '@aztec/stdlib/messaging';

import type { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import type { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { Option } from '../noir-structs/option.js';
>>>>>>> origin/v5-next
import type { PendingTaggedLog } from '../noir-structs/pending_tagged_log.js';
import type { ResolvedTx } from '../noir-structs/resolved_tx.js';
import {
  type InferDeserializedParams,
  ORACLE_REGISTRY,
  type OracleRegistryEntry,
  type ParamTypes,
  type RegistryParam,
} from './oracle_registry.js';
import {
<<<<<<< HEAD
=======
  AZTEC_ADDRESS,
>>>>>>> origin/v5-next
  EPHEMERAL_ARRAY,
  FIELD,
  FIXED_BOUNDED_VEC,
  STRUCT,
  TX_HASH,
  type TypeMapping,
} from './oracle_type_mappings.js';

const LEGACY_LOG_RETRIEVAL_RESPONSE: TypeMapping<LegacyLogRetrievalResponse> = STRUCT([
  { name: 'logPayload', type: FIXED_BOUNDED_VEC(FIELD, PRIVATE_LOG_CIPHERTEXT_LEN) },
  { name: 'txHash', type: TX_HASH },
  { name: 'uniqueNoteHashesInTx', type: FIXED_BOUNDED_VEC(FIELD, MAX_NOTE_HASHES_PER_TX) },
  { name: 'firstNullifierInTx', type: FIELD },
]);

// Block-less transaction context: the prefix of `ResolvedTx`'s wire carried by the original `getPendingTaggedLogs`
// oracle. Known as `MessageContext` in the Aztec.nr versions that call that oracle.
const LEGACY_MESSAGE_CONTEXT: TypeMapping<LegacyMessageContext> = STRUCT<LegacyMessageContext>([
  { name: 'txHash', type: TX_HASH },
  { name: 'uniqueNoteHashesInTx', type: FIXED_BOUNDED_VEC(FIELD, MAX_NOTE_HASHES_PER_TX) },
  { name: 'firstNullifierInTx', type: FIELD },
]);

const LEGACY_PENDING_TAGGED_LOG: TypeMapping<LegacyPendingTaggedLog> = STRUCT<LegacyPendingTaggedLog>([
  { name: 'log', type: FIXED_BOUNDED_VEC(FIELD, PRIVATE_LOG_SIZE_IN_FIELDS) },
  { name: 'context', type: LEGACY_MESSAGE_CONTEXT },
]);

/**
 * Wire shapes that already-deployed contracts still call by their original oracle name, keyed by that retired name.
 * New Aztec.nr calls the current name in `ORACLE_REGISTRY`; old bytecode keeps calling the name compiled into it and
 * is served from here, so versioning an oracle's wire (e.g. adding return fields) stops being a breaking change.
 *
 * Append-only. Drop an entry only once the `ORACLE_VERSION_MAJOR` that introduced its successor is retired, since
 * older contracts can no longer run against this environment.
 */
export const LEGACY_ORACLE_REGISTRY: Record<string, LegacyOracleEntry> = {
<<<<<<< HEAD
=======
  aztec_utl_getL1ToL2MembershipWitness: legacyOracle({
    modernOracle: 'aztec_utl_getL1ToL2MembershipWitnessV2',
    // The old wire passed the contract address and secret, the modern oracle takes the unsiloed nullifier (plus the
    // address to silo it with) instead. We derive it here so already-deployed contracts that still emit the old call
    // keep working.
    //
    // This is the fee juice message nullifier derivation: only contracts using that scheme call this retired oracle.
    params: {
      legacyType: [
        { name: 'contractAddress', type: AZTEC_ADDRESS },
        { name: 'messageHash', type: FIELD },
        { name: 'secret', type: FIELD },
      ],
      mapping: async ([contractAddress, messageHash, secret]) => [
        messageHash,
        Option.some({ contractAddress, nullifier: await computeFeeJuiceMessageNullifier(messageHash, secret) }),
      ],
    },
  }),
>>>>>>> origin/v5-next
  aztec_utl_getLogsByTag: legacyOracle({
    modernOracle: 'aztec_utl_getLogsByTagV2',
    returnType: {
      legacyType: EPHEMERAL_ARRAY(EPHEMERAL_ARRAY(LEGACY_LOG_RETRIEVAL_RESPONSE)),
      // We can map this directly, since the new type is a superset of the old type
      mapping: result => result as unknown as EphemeralArray<EphemeralArray<LegacyLogRetrievalResponse>>,
    },
  }),
  aztec_utl_getPendingTaggedLogs: legacyOracle({
    modernOracle: 'aztec_utl_getPendingTaggedLogsV2',
    returnType: {
      legacyType: EPHEMERAL_ARRAY(LEGACY_PENDING_TAGGED_LOG),
      // We can map this directly, since `ResolvedTx` carries the legacy context's fields under the same names
      mapping: result => result as unknown as EphemeralArray<LegacyPendingTaggedLog>,
    },
  }),
};

type LegacyLogRetrievalResponse = Pick<
  LogRetrievalResponse,
  'logPayload' | 'txHash' | 'uniqueNoteHashesInTx' | 'firstNullifierInTx'
>;

type LegacyMessageContext = Pick<ResolvedTx, 'txHash' | 'uniqueNoteHashesInTx' | 'firstNullifierInTx'>;

type LegacyPendingTaggedLog = {
  log: PendingTaggedLog['log'];
  context: LegacyMessageContext;
};

type Registry = typeof ORACLE_REGISTRY;

/** The handler return value type of a modern oracle entry. */
type ReturnValueOf<K extends keyof Registry> = Registry[K] extends OracleRegistryEntry<any, infer R> ? R : never;

/** The modern handler's positional argument tuple, derived from the oracle's declared params. */
type HandlerArgsOf<K extends keyof Registry> = ParamTypes<ReturnType<Registry[K]['deserializeParams']>>;

/**
 * A legacy oracle adapter, stored under the retired oracle name that already-deployed contracts still call. It reuses
 * the handler of `modernOracle` and overrides only the wire side(s) that changed; an omitted side falls back to that
 * modern entry.
 */
export interface LegacyOracleEntry {
  /** The current oracle whose handler this reuses and whose param/return wire it inherits by default. */
  modernOracle: keyof Registry;
  /**
   * Old param wire. `legacyType` deserializes the old wire; `mapping` bridges the deserialized legacy args to the
<<<<<<< HEAD
   * modern handler's args. Omit when the param wire is unchanged.
   */
  params?: { legacyType: readonly RegistryParam[]; mapping: (legacyArgs: any) => readonly unknown[] };
=======
   * modern handler's args. The mapping may be async. Omit when the param wire is unchanged.
   */
  params?: {
    legacyType: readonly RegistryParam[];
    mapping: (legacyArgs: any) => readonly unknown[] | Promise<readonly unknown[]>;
  };
>>>>>>> origin/v5-next
  /**
   * Old return wire. `legacyType` serializes the subset the old contract reads; `mapping` bridges the handler's
   * current result to that subset's value type. Omit when the return wire is unchanged.
   */
  returnType?: { legacyType: TypeMapping; mapping: (result: any) => unknown };
}

function legacyOracle<K extends keyof Registry, W = never, const TLegacyParams extends RegistryParam[] = []>(entry: {
  modernOracle: K;
  params?: {
    legacyType: [...TLegacyParams];
<<<<<<< HEAD
    mapping: (legacyArgs: ParamTypes<InferDeserializedParams<TLegacyParams>>) => HandlerArgsOf<K>;
=======
    mapping: (
      legacyArgs: ParamTypes<InferDeserializedParams<TLegacyParams>>,
    ) => HandlerArgsOf<K> | Promise<HandlerArgsOf<K>>;
>>>>>>> origin/v5-next
  };
  returnType?: { legacyType: TypeMapping<W>; mapping: (result: ReturnValueOf<K>) => W };
}): LegacyOracleEntry {
  return entry;
}
