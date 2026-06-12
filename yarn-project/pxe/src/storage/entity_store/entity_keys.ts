import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The block a retractable entity or fact originates from.
 */
export type OriginBlock = { blockNumber: number; blockHash: Fr };

/** Identifies all entities of one type within a contract+scope. */
export type ScopeKey = {
  contractAddress: AztecAddress;
  scope: AztecAddress;
  entityTypeId: Fr;
};

/** Uniquely identifies a single entity; all its facts share this key. */
export type EntityKey = ScopeKey & { entityId: Fr };

/** Serialized form of a {@link ScopeKey} (`contract:scope:entityTypeId`), used as kv-store map keys. */
export type ScopeKeyStr = string;

/** Serialized form of an {@link EntityKey} (`scopeKeyStr:entityId`), used as kv-store map keys. */
export type EntityKeyStr = string;

/** Serializes a {@link ScopeKey}. */
export function scopeKeyStrOf(key: ScopeKey): ScopeKeyStr {
  return `${key.contractAddress}:${key.scope}:${key.entityTypeId}`;
}

/** Serializes an {@link EntityKey}. */
export function entityKeyStrOf(key: EntityKey): EntityKeyStr {
  return `${scopeKeyStrOf(key)}:${key.entityId}`;
}
