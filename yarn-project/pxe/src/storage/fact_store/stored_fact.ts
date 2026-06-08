import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/** The block an anchored (retractable) fact is tied to. */
export type FactAnchor = { blockNumber: number; blockHash: Fr };

/**
 * A single immutable fact about an entity. `anchor === undefined` marks the fact non-retractable (an external
 * input that survives reorgs); an anchor marks it retractable (re-derivable, deleted when its block is pruned).
 */
export class StoredFact {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly entityTypeId: Fr,
    public readonly correlationKey: Fr,
    public readonly factTypeId: Fr,
    public readonly payload: Fr[],
    public readonly anchor: FactAnchor | undefined,
  ) {}

  /** Whether this fact is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.anchor !== undefined;
  }

  /** Stable digest of the payload, used in the dedup row key (keeps the LMDB key bounded for large payloads). */
  payloadHash(): Fr {
    return sha256ToField([this.payload.length, ...this.payload]);
  }

  toBuffer(): Buffer {
    const anchorTag = this.anchor ? 1 : 0;
    return serializeToBuffer(
      this.contractAddress,
      this.scope,
      this.entityTypeId,
      this.correlationKey,
      this.factTypeId,
      this.payload.length,
      ...this.payload,
      anchorTag,
      this.anchor ? this.anchor.blockNumber : 0,
      this.anchor ? this.anchor.blockHash : Fr.ZERO,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): StoredFact {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = reader.readObject(AztecAddress);
    const scope = reader.readObject(AztecAddress);
    const entityTypeId = reader.readObject(Fr);
    const correlationKey = reader.readObject(Fr);
    const factTypeId = reader.readObject(Fr);
    const payloadLen = reader.readNumber();
    const payload = reader.readArray(payloadLen, Fr);
    const anchorTag = reader.readNumber();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const anchor = anchorTag === 1 ? { blockNumber, blockHash } : undefined;
    return new StoredFact(contractAddress, scope, entityTypeId, correlationKey, factTypeId, [...payload], anchor);
  }
}

/**
 * The record for a single entity, with its own payload and optional block anchor. `anchor === undefined` marks the
 * entity non-retractable (it survives reorgs; only its own retractable facts are pruned); an anchor marks the whole
 * entity retractable — on a prune above its block, the entity payload and every fact it owns are deleted wholesale.
 */
export class StoredEntity {
  constructor(
    public readonly contractAddress: AztecAddress,
    public readonly scope: AztecAddress,
    public readonly entityTypeId: Fr,
    public readonly correlationKey: Fr,
    public readonly payload: Fr[],
    public readonly anchor: FactAnchor | undefined,
  ) {}

  /** Whether the whole entity is deleted on block pruning (true) or survives reorgs (false). */
  get isRetractable(): boolean {
    return this.anchor !== undefined;
  }

  toBuffer(): Buffer {
    const anchorTag = this.anchor ? 1 : 0;
    return serializeToBuffer(
      this.contractAddress,
      this.scope,
      this.entityTypeId,
      this.correlationKey,
      this.payload.length,
      ...this.payload,
      anchorTag,
      this.anchor ? this.anchor.blockNumber : 0,
      this.anchor ? this.anchor.blockHash : Fr.ZERO,
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader): StoredEntity {
    const reader = BufferReader.asReader(buffer);
    const contractAddress = reader.readObject(AztecAddress);
    const scope = reader.readObject(AztecAddress);
    const entityTypeId = reader.readObject(Fr);
    const correlationKey = reader.readObject(Fr);
    const payloadLen = reader.readNumber();
    const payload = reader.readArray(payloadLen, Fr);
    const anchorTag = reader.readNumber();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readObject(Fr);
    const anchor = anchorTag === 1 ? { blockNumber, blockHash } : undefined;
    return new StoredEntity(contractAddress, scope, entityTypeId, correlationKey, [...payload], anchor);
  }
}

/** Key that groups all entities of the same type within a contract+scope. */
export function scopeKey(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr): string {
  return `${contract}:${scope}:${entityTypeId}`;
}

/** Key that uniquely identifies a single entity (all its facts share this key prefix). */
export function entityKey(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr, correlationKey: Fr): string {
  return `${scopeKey(contract, scope, entityTypeId)}:${correlationKey}`;
}

/** Key that groups all entities of the same type within a contract+scope. */
export function scopeKeyOf(fact: StoredFact): string {
  return scopeKey(fact.contractAddress, fact.scope, fact.entityTypeId);
}

/** Key that uniquely identifies a single entity (all its facts share this key prefix). */
export function entityKeyOf(fact: StoredFact): string {
  return entityKey(fact.contractAddress, fact.scope, fact.entityTypeId, fact.correlationKey);
}

/** Dedup row key for a specific fact; incorporates a payload hash to bound key size for large payloads. */
export function factRowKeyOf(fact: StoredFact): string {
  return `${entityKeyOf(fact)}:${fact.factTypeId}:${fact.payloadHash()}`;
}
