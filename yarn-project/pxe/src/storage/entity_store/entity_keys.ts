import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The block a retractable entity or fact originates from.
 */
export type OriginBlock = { blockNumber: number; blockHash: Fr };

/** The contract+scope+entityType coordinates identifying one entity type within a contract+scope. */
export type ScopeCoords = {
  contractAddress: AztecAddress;
  scope: AztecAddress;
  entityTypeId: Fr;
};

/** The contract+scope+entityType+entityId coordinates shared by facts and entity records. */
export type EntityCoords = ScopeCoords & { entityId: Fr };

/** Key that groups all entities of the same type within a contract+scope (`contract:scope:entityTypeId`). */
export type ScopeKey = string;

/** Key that uniquely identifies a single entity, `scopeKey:entityId`. All its facts share this key prefix. */
export type EntityKey = string;

/** Builds the {@link ScopeKey} for the given coordinates. */
export function scopeKey(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr): ScopeKey {
  return `${contract}:${scope}:${entityTypeId}`;
}

/** Builds the {@link EntityKey} for the given coordinates. */
export function entityKey(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr, entityId: Fr): EntityKey {
  return `${scopeKey(contract, scope, entityTypeId)}:${entityId}`;
}

/** Builds the {@link ScopeKey} for the given coordinates. */
export function scopeKeyOf(coords: ScopeCoords): ScopeKey {
  return scopeKey(coords.contractAddress, coords.scope, coords.entityTypeId);
}

/** Builds the {@link EntityKey} for the given coordinates. */
export function entityKeyOf(coords: EntityCoords): EntityKey {
  return entityKey(coords.contractAddress, coords.scope, coords.entityTypeId, coords.entityId);
}
