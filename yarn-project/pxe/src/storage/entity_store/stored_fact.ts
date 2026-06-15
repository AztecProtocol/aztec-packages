import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityKey, type OriginBlock } from './entity_store_keys.js';

/** A fact as returned by the entity store: its type and payload, plus the optional origin block it is tied to. */
export type Fact = { factTypeId: Fr; payload: Fr[]; originBlock: OriginBlock | undefined };

/**
 * A single immutable fact about an entity. `originBlock === undefined` marks the fact non-retractable (an external
 * input that survives reorgs); an origin block marks it retractable (re-derivable, deleted when its block is pruned).
 */
export class StoredFact {
  constructor(
    public readonly entityKey: EntityKey,
    public readonly factTypeId: Fr,
    public readonly payload: Fr[],
    public readonly originBlock: OriginBlock | undefined,
  ) {}

  /** Whether this fact is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.originBlock !== undefined;
  }

  /** Stable digest of the payload, used in the dedup fact key (keeps the LMDB key bounded for large payloads). */
  payloadHash(): Fr {
    return sha256ToField([this.payload.length, ...this.payload]);
  }

  /** Returns the externally facing view of this fact, without the storage coordinates. */
  toFact(): Fact {
    return { factTypeId: this.factTypeId, payload: this.payload, originBlock: this.originBlock };
  }

  toBuffer(): Buffer {
    const originBlockTag = this.originBlock ? 1 : 0;
    return serializeToBuffer(
      this.entityKey.contractAddress,
      this.entityKey.scope,
      this.entityKey.entityTypeId,
      this.entityKey.entityId,
      this.factTypeId,
      this.payload.length,
      ...this.payload,
      originBlockTag,
      this.originBlock ? this.originBlock.blockNumber : 0,
      this.originBlock ? this.originBlock.blockHash : Fr.ZERO,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): StoredFact {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = reader.readObject(AztecAddress);
    const scope = reader.readObject(AztecAddress);
    const entityTypeId = reader.readObject(Fr);
    const entityId = reader.readObject(Fr);
    const factTypeId = reader.readObject(Fr);
    const payloadLen = reader.readNumber();
    const payload = reader.readArray(payloadLen, Fr);
    const originBlockTag = reader.readNumber();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const originBlock = originBlockTag === 1 ? { blockNumber, blockHash } : undefined;
    return new StoredFact(
      new EntityKey(contractAddress, scope, entityTypeId, entityId),
      factTypeId,
      [...payload],
      originBlock,
    );
  }
}

/**
 * Serialized key that identifies and dedups a fact (`entityKeyStr:factTypeId:payloadHash:originBlock`). The payload
 * hash (rather than the raw payload) bounds key size for large payloads. The origin block (height and hash, or `none`
 * when non-retractable) is part of the identity, so the same payload derived at different blocks is a distinct fact.
 */
export type FactKeyStr = string;

/** Builds the {@link FactKeyStr} for the given fact. */
export function factKeyStrOf(fact: StoredFact): FactKeyStr {
  const origin = fact.originBlock ? `${fact.originBlock.blockNumber}:${fact.originBlock.blockHash}` : 'none';
  return `${fact.entityKey}:${fact.factTypeId}:${fact.payloadHash()}:${origin}`;
}

/**
 * Serializes a fact for storage, prefixed with the monotonic sequence number assigned when it was first committed.
 * Multimap value order is backend-dependent (insertion order on IndexedDB, value-sorted on LMDB), so reads sort by
 * `seq` to return facts in creation order.
 */
export function serializeFact(seq: number, fact: StoredFact): Buffer {
  return serializeToBuffer(seq, fact);
}

/** Deserializes a fact and its sequence number from storage. */
export function deserializeFact(buffer: Buffer): { seq: number; fact: StoredFact } {
  const reader = BufferReader.asReader(buffer);
  const seq = reader.readNumber();
  const fact = StoredFact.fromBuffer(reader);
  return { seq, fact };
}
