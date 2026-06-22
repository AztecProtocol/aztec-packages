import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The block a retractable fact originates from.
 */
export type OriginBlock = { blockNumber: number; blockHash: Fr };

/** Identifies all fact collections of one type within a contract. */
export class FactCollectionTypeKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly factCollectionTypeId: Fr,
  ) {}

  static from(fields: FieldsOf<FactCollectionTypeKey>): FactCollectionTypeKey {
    return new FactCollectionTypeKey(fields.contractAddress, fields.factCollectionTypeId);
  }

  toString(): string {
    return `${this.contractAddress}:${this.factCollectionTypeId}`;
  }
}

/** Uniquely identifies a single fact collection; all its facts share this key. */
export class FactCollectionKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly factCollectionTypeId: Fr,
    public readonly factCollectionId: Fr,
  ) {}

  static from(fields: FieldsOf<FactCollectionKey>): FactCollectionKey {
    return new FactCollectionKey(fields.contractAddress, fields.factCollectionTypeId, fields.factCollectionId);
  }

  /** The key grouping this collection with the other collections of its type within the same contract. */
  factCollectionTypeKey(): FactCollectionTypeKey {
    return new FactCollectionTypeKey(this.contractAddress, this.factCollectionTypeId);
  }

  toString(): string {
    return `${this.factCollectionTypeKey()}:${this.factCollectionId}`;
  }
}
