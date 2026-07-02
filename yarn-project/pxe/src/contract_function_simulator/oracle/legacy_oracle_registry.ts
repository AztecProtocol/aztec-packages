/* eslint-disable camelcase */
import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';

import type { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import type { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import {
  type InferDeserializedParams,
  ORACLE_REGISTRY,
  type OracleRegistryEntry,
  type ParamTypes,
  type RegistryParam,
} from './oracle_registry.js';
import {
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

/**
 * Wire shapes that already-deployed contracts still call by their original oracle name, keyed by that retired name.
 * New Aztec.nr calls the current name in `ORACLE_REGISTRY`; old bytecode keeps calling the name compiled into it and
 * is served from here, so versioning an oracle's wire (e.g. adding return fields) stops being a breaking change.
 *
 * Append-only. Drop an entry only once the `ORACLE_VERSION_MAJOR` that introduced its successor is retired, since
 * older contracts can no longer run against this environment.
 */
export const LEGACY_ORACLE_REGISTRY: Record<string, LegacyOracleEntry> = {
  aztec_utl_getLogsByTag: legacyOracle({
    modernOracle: 'aztec_utl_getLogsByTagV2',
    returnType: {
      legacyType: EPHEMERAL_ARRAY(EPHEMERAL_ARRAY(LEGACY_LOG_RETRIEVAL_RESPONSE)),
      // We can map this directly, since the new type is a superset of the old type
      mapping: result => result as unknown as EphemeralArray<EphemeralArray<LegacyLogRetrievalResponse>>,
    },
  }),
};

type LegacyLogRetrievalResponse = Pick<
  LogRetrievalResponse,
  'logPayload' | 'txHash' | 'uniqueNoteHashesInTx' | 'firstNullifierInTx'
>;

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
   * modern handler's args. Omit when the param wire is unchanged.
   */
  params?: { legacyType: readonly RegistryParam[]; mapping: (legacyArgs: any) => readonly unknown[] };
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
    mapping: (legacyArgs: ParamTypes<InferDeserializedParams<TLegacyParams>>) => HandlerArgsOf<K>;
  };
  returnType?: { legacyType: TypeMapping<W>; mapping: (result: ReturnValueOf<K>) => W };
}): LegacyOracleEntry {
  return entry;
}
