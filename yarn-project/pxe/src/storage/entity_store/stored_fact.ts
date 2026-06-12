import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { type OriginBlock, entityKeyOf } from './entity_keys.js';

/**
 * A single immutable fact about an entity. `originBlock === undefined` marks the fact non-retractable (an external
 * input that survives reorgs); an origin block marks it retractable (re-derivable, deleted when its block is pruned).
 */
export class StoredFact {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly entityTypeId: Fr,
    public readonly entityId: Fr,
    public readonly factTypeId: Fr,
    public readonly payload: Fr[],
    public readonly originBlock: OriginBlock | undefined,
  ) {}

  /** Whether this fact is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.originBlock !== undefined;
  }

  /** Stable digest of the payload, used in the dedup row key (keeps the LMDB key bounded for large payloads). */
  payloadHash(): Fr {
    return sha256ToField([this.payload.length, ...this.payload]);
  }

  toBuffer(): Buffer {
    const originBlockTag = this.originBlock ? 1 : 0;
    return serializeToBuffer(
      this.contractAddress,
      this.scope,
      this.entityTypeId,
      this.entityId,
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
    return new StoredFact(contractAddress, scope, entityTypeId, entityId, factTypeId, [...payload], originBlock);
  }
}

/**
 * Dedup row key for a specific fact, `entityKey:factTypeId:payloadHash`. The payload hash (rather than the raw
 * payload) bounds key size for large payloads.
 */
export type FactRowKey = string;

/** Builds the {@link FactRowKey} for the given fact. */
export function factRowKeyOf(fact: StoredFact): FactRowKey {
  return `${entityKeyOf(fact)}:${fact.factTypeId}:${fact.payloadHash()}`;
}
