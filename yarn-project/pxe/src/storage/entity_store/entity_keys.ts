import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/** The block a retractable entity or fact originates from. */
export type OriginBlock = { blockNumber: number; blockHash: Fr };

/** The contract+scope+entityType+entityId coordinates shared by facts and entity records. */
export type EntityCoords = {
  contractAddress: AztecAddress;
  scope: AztecAddress;
  entityTypeId: Fr;
  entityId: Fr;
};

/** Key that groups all entities of the same type within a contract+scope. */
export function scopeKey(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr): string {
  return `${contract}:${scope}:${entityTypeId}`;
}

/** Key that uniquely identifies a single entity (all its facts share this key prefix). */
export function entityKey(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr, entityId: Fr): string {
  return `${scopeKey(contract, scope, entityTypeId)}:${entityId}`;
}

/** Key that groups all entities of the same type within a contract+scope. */
export function scopeKeyOf(coords: EntityCoords): string {
  return scopeKey(coords.contractAddress, coords.scope, coords.entityTypeId);
}

/** Key that uniquely identifies a single entity (all its facts share this key prefix). */
export function entityKeyOf(coords: EntityCoords): string {
  return entityKey(coords.contractAddress, coords.scope, coords.entityTypeId, coords.entityId);
}
