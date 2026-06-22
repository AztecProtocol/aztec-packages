import { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The block a retractable fact originates from.
 */
export type OriginBlock = { blockNumber: number; blockHash: Fr };

/** Facts are always tied to a real scope; the zero address is not a valid fact scope. */
function assertNonZeroScope(scope: AztecAddress): void {
  if (scope.equals(AztecAddress.ZERO)) {
    throw new Error('scope must not be the zero address');
  }
}

/** Identifies all fact collections of one type within a contract, for one scope. */
export class FactCollectionTypeKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly factCollectionTypeId: Fr,
  ) {
    assertNonZeroScope(scope);
  }

  static from(fields: FieldsOf<FactCollectionTypeKey>): FactCollectionTypeKey {
    return new FactCollectionTypeKey(fields.contractAddress, fields.scope, fields.factCollectionTypeId);
  }

  toString(): string {
    return `${this.contractAddress}:${this.scope}:${this.factCollectionTypeId}`;
  }
}

/** Uniquely identifies a single fact collection, isolated by scope; all its facts share this key. */
export class FactCollectionKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly factCollectionTypeId: Fr,
    public readonly factCollectionId: Fr,
  ) {
    assertNonZeroScope(scope);
  }

  static from(fields: FieldsOf<FactCollectionKey>): FactCollectionKey {
    return new FactCollectionKey(
      fields.contractAddress,
      fields.scope,
      fields.factCollectionTypeId,
      fields.factCollectionId,
    );
  }

  /** Inverse of toString */
  static fromString(str: string): FactCollectionKey {
    const [contractAddress, scope, factCollectionTypeId, factCollectionId] = str.split(':');
    return new FactCollectionKey(
      AztecAddress.fromString(contractAddress),
      AztecAddress.fromString(scope),
      Fr.fromString(factCollectionTypeId),
      Fr.fromString(factCollectionId),
    );
  }

  /** The key grouping this collection with the other collections of its type within the same contract and scope. */
  factCollectionTypeKey(): FactCollectionTypeKey {
    return new FactCollectionTypeKey(this.contractAddress, this.scope, this.factCollectionTypeId);
  }

  toString(): string {
    return `${this.contractAddress}:${this.scope}:${this.factCollectionTypeId}:${this.factCollectionId}`;
  }
}
