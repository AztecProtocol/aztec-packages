import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactCollectionKey, type OriginBlock } from './fact_store_keys.js';

/** A fact as returned by the fact store. */
export type Fact = { factTypeId: Fr; payload: Fr[]; originBlock: OriginBlock | undefined };

/**
 * A single immutable fact belonging to a fact collection.
 */
export class StoredFact {
  constructor(
    public readonly factCollectionKey: FactCollectionKey,
    public readonly factTypeId: Fr,
    public readonly payload: Fr[],
    public readonly originBlock: OriginBlock | undefined,
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
    return serializeToBuffer(
      this.factCollectionKey.contractAddress,
      this.factCollectionKey.factCollectionTypeId,
      this.factCollectionKey.factCollectionId,
      this.factTypeId,
      this.payload.length,
      ...this.payload,
      this.originBlock !== undefined,
      this.originBlock ? this.originBlock.blockNumber : 0,
      this.originBlock ? this.originBlock.blockHash : Fr.ZERO,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): StoredFact {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = reader.readObject(AztecAddress);
    const factCollectionTypeId = reader.readObject(Fr);
    const factCollectionId = reader.readObject(Fr);
    const factTypeId = reader.readObject(Fr);
    const payloadLen = reader.readNumber();
    const payload = reader.readArray(payloadLen, Fr);
    const hasOriginBlock = reader.readBoolean();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const originBlock = hasOriginBlock ? { blockNumber, blockHash } : undefined;
    return new StoredFact(
      new FactCollectionKey(contractAddress, factCollectionTypeId, factCollectionId),
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
