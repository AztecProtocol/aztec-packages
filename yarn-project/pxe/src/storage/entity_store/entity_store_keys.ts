import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The block a retractable entity or fact originates from.
 */
export type OriginBlock = { blockNumber: number; blockHash: Fr };

/** Identifies all entities of one type within a contract+scope. */
export class EntityTypeKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly entityTypeId: Fr,
  ) {}

  static from(fields: FieldsOf<EntityTypeKey>): EntityTypeKey {
    return new EntityTypeKey(fields.contractAddress, fields.scope, fields.entityTypeId);
  }

  toString(): string {
    return `${this.contractAddress}:${this.scope}:${this.entityTypeId}`;
  }
}

/** Uniquely identifies a single entity; all its facts share this key. */
export class EntityKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly entityTypeId: Fr,
    public readonly entityId: Fr,
  ) {}

  static from(fields: FieldsOf<EntityKey>): EntityKey {
    return new EntityKey(fields.contractAddress, fields.scope, fields.entityTypeId, fields.entityId);
  }

  /** The key grouping this entity with the other entities of its type within the same contract+scope. */
  entityTypeKey(): EntityTypeKey {
    return new EntityTypeKey(this.contractAddress, this.scope, this.entityTypeId);
  }

  toString(): string {
    return `${this.entityTypeKey()}:${this.entityId}`;
  }
}
