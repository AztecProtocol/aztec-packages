import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { FactScope } from './fact_scope.js';
import { type BlockReference, FactCollectionKey } from './fact_store_keys.js';

/** A fact as returned by the fact store. */
export type Fact = { factTypeId: Fr; payload: Fr[]; originBlock: BlockReference | undefined };

/**
 * A single immutable fact belonging to a fact collection.
 */
export class StoredFact {
  constructor(
    public readonly factCollectionKey: FactCollectionKey,
    public readonly factTypeId: Fr,
    public readonly payload: Fr[],
    public readonly originBlock: BlockReference | undefined,
  ) {}

  /** Whether this fact is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.originBlock !== undefined;
  }

  /** Stable digest of the payload, used for fact idempotency. */
  payloadHash(): Fr {
    return sha256ToField([this.payload.length, ...this.payload]);
  }

  /** Returns the externally facing view of this fact. */
  toFact(): Fact {
    return { factTypeId: this.factTypeId, payload: this.payload, originBlock: this.originBlock };
  }

  toBuffer(): Buffer {
    const { scope } = this.factCollectionKey;
    const record = (scopeAccount: AztecAddress) =>
      serializeToBuffer(
        this.factCollectionKey.contractAddress,
        scopeAccount,
        this.factCollectionKey.factCollectionTypeId,
        this.factCollectionKey.factCollectionId,
        this.factTypeId,
        this.payload.length,
        ...this.payload,
        this.originBlock !== undefined,
        this.originBlock ? this.originBlock.blockNumber : 0,
        this.originBlock ? this.originBlock.blockHash : Fr.ZERO,
      );
    // For DB schema compatibility, account records use the schema's record layout unchanged, and public records extend
    // it with a trailing marker instead of adding a scope kind field.
    switch (scope.type) {
      case 'account':
        return record(scope.account);
      case 'public':
        return Buffer.concat([record(AztecAddress.ZERO), serializeToBuffer(true)]);
      default: {
        const _exhaustive: never = scope;
        throw new Error(`Unhandled fact scope type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  /**
   * Inverse of {@link toBuffer}.
   *
   * `buffer` must end where the record does, since any bytes after an account record are read as the public scope
   * marker.
   */
  static fromBuffer(buffer: Buffer): StoredFact {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = reader.readObject(AztecAddress);
    const scopeAccount = reader.readObject(AztecAddress);
    const factCollectionTypeId = reader.readObject(Fr);
    const factCollectionId = reader.readObject(Fr);
    const factTypeId = reader.readObject(Fr);
    const payloadLen = reader.readNumber();
    const payload = reader.readArray(payloadLen, Fr);
    const hasOriginBlock = reader.readBoolean();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const originBlock = hasOriginBlock ? { blockNumber, blockHash } : undefined;
    let scope: FactScope = { type: 'account', account: scopeAccount };
    if (!reader.isEmpty()) {
      const malformed = `Malformed public scope marker in stored fact of contract ${contractAddress}`;
      if (!reader.readBoolean()) {
        throw new Error(`${malformed}: marker is false`);
      }
      if (!reader.isEmpty()) {
        throw new Error(`${malformed}: trailing bytes after the marker`);
      }
      if (!scopeAccount.isZero()) {
        throw new Error(`${malformed}: record names account ${scopeAccount}`);
      }
      scope = { type: 'public' };
    }
    return new StoredFact(
      new FactCollectionKey(contractAddress, scope, factCollectionTypeId, factCollectionId),
      factTypeId,
      [...payload],
      originBlock,
    );
  }
}

/**
 * Builds the serialized key that identifies a fact in the store.
 */
export function factKeyStrOf(fact: StoredFact): string {
  const origin = fact.originBlock ? `${fact.originBlock.blockNumber}:${fact.originBlock.blockHash}` : 'none';
  return `${fact.factCollectionKey}:${fact.factTypeId}:${fact.payloadHash()}:${origin}`;
}
