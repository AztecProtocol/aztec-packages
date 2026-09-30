import { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { FactScope } from './fact_scope.js';

/** A block, identified by its number and hash. */
export type BlockReference = { blockNumber: number; blockHash: Fr };

// Account scopes are keyed by their hex address, which can never equal this token.
const PUBLIC_SCOPE_KEY_PART = 'public';

function scopeToKeyPart(scope: FactScope): string {
  switch (scope.type) {
    case 'account':
      return scope.account.toString();
    case 'public':
      return PUBLIC_SCOPE_KEY_PART;
    default: {
      const _exhaustive: never = scope;
      throw new Error(`Unhandled fact scope type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function scopeFromKeyPart(part: string): FactScope {
  return part === PUBLIC_SCOPE_KEY_PART
    ? { type: 'public' }
    : { type: 'account', account: AztecAddress.fromStringUnsafe(part) };
}

/** Identifies all fact collections of one type within a contract, for one scope. */
export class FactCollectionTypeKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: FactScope,
    public readonly factCollectionTypeId: Fr,
  ) {}

  static from(fields: FieldsOf<FactCollectionTypeKey>): FactCollectionTypeKey {
    return new FactCollectionTypeKey(fields.contractAddress, fields.scope, fields.factCollectionTypeId);
  }

  toString(): string {
    return `${this.contractAddress}:${scopeToKeyPart(this.scope)}:${this.factCollectionTypeId}`;
  }
}

/** Uniquely identifies a single fact collection, isolated by scope; all its facts share this key. */
export class FactCollectionKey {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: FactScope,
    public readonly factCollectionTypeId: Fr,
    public readonly factCollectionId: Fr,
  ) {}

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
      AztecAddress.fromStringUnsafe(contractAddress),
      scopeFromKeyPart(scope),
      Fr.fromString(factCollectionTypeId),
      Fr.fromString(factCollectionId),
    );
  }

  /** The key grouping this collection with the other collections of its type within the same contract and scope. */
  factCollectionTypeKey(): FactCollectionTypeKey {
    return new FactCollectionTypeKey(this.contractAddress, this.scope, this.factCollectionTypeId);
  }

  toString(): string {
    return `${this.contractAddress}:${scopeToKeyPart(this.scope)}:${this.factCollectionTypeId}:${this.factCollectionId}`;
  }
}
