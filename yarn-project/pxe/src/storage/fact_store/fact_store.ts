import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Anchor, Anchored } from '../foundation/anchor.js';
import { type CanonicalityCheck, filterCanonical } from '../foundation/anchored_read.js';

/** Stable identifier for an entity type. */
export type EntityTypeId = Fr;
/** Stable identifier for a fact type. */
export type FactTypeId = Fr;

/** One stored fact: its type, opaque payload, and the chain position that produced it (or null). */
export type StoredFact = { factType: FactTypeId; payload: Buffer; anchor: Anchor | null };

/**
 * Appends facts and reads back the currently-canonical fact set for one entity.
 * Anchored facts are filtered by the canonicality predicate; unanchored facts are always visible.
 */
export class FactStore {
  readonly storeName = 'fact';

  #store: AztecAsyncKVStore;
  #chain: CanonicalityCheck;
  /** dedupKey -> serialized StoredFact */
  #facts: AztecAsyncMap<string, Buffer>;
  /** (contract|scope|entityType|correlationKey) -> dedupKey */
  #factsByEntity: AztecAsyncMultiMap<string, string>;
  /** (contract|scope|entityType) -> correlationKey hex */
  #entitiesByType: AztecAsyncMultiMap<string, string>;
  /** (contract|scope|entityType|correlationKey) -> marker byte */
  #terminated: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore, chain: CanonicalityCheck) {
    this.#store = store;
    this.#chain = chain;
    this.#facts = store.openMap('facts');
    this.#factsByEntity = store.openMultiMap('facts_by_entity');
    this.#entitiesByType = store.openMultiMap('facts_entities_by_type');
    this.#terminated = store.openMap('facts_terminated');
  }

  /** Insert a fact, scoped to a (contract, scope) pair. Idempotent: re-putting the same row key is a no-op overwrite. */
  put(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    factType: FactTypeId,
    correlationKey: Buffer,
    payload: Buffer,
    anchor: Anchor | null,
  ): Promise<void> {
    const dedupKey = this.#dedupKey(contract, scope, entityType, factType, correlationKey, payload, anchor);
    const entityKey = this.#entityKey(contract, scope, entityType, correlationKey);
    return this.#store.transactionAsync(async () => {
      await this.#facts.set(dedupKey, this.#serialize(factType, payload, anchor));
      await this.#factsByEntity.set(entityKey, dedupKey);
      await this.#entitiesByType.set(this.#typeKey(contract, scope, entityType), correlationKey.toString('hex'));
    });
  }

  /** All facts for one (contract, scope, entity) that are currently canonical (anchored facts filtered, unanchored kept). */
  async loadCanonicalFactSet(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
  ): Promise<StoredFact[]> {
    const entityKey = this.#entityKey(contract, scope, entityType, correlationKey);

    const facts = await this.#store.transactionAsync(async () => {
      const seen = new Set<string>();
      const reads: Promise<Buffer | undefined>[] = [];
      for await (const dedupKey of this.#factsByEntity.getValuesAsync(entityKey)) {
        if (seen.has(dedupKey)) {
          continue;
        }
        seen.add(dedupKey);
        reads.push(this.#facts.getAsync(dedupKey));
      }
      const buffers = await Promise.all(reads);
      return buffers.filter((b): b is Buffer => b !== undefined).map(b => this.#deserialize(b));
    });

    const unanchored = facts.filter(f => f.anchor === null);
    const anchored = facts.filter((f): f is Anchored<StoredFact> => f.anchor !== null);
    const canonical = await filterCanonical(this.#chain, anchored);
    return [...unanchored, ...canonical];
  }

  /** Correlation keys of all entities of `entityType` for `(contract, scope)` that have at least one fact. */
  async activeEntities(contract: AztecAddress, scope: AztecAddress, entityType: EntityTypeId): Promise<Buffer[]> {
    const seen = new Set<string>();
    for await (const corrHex of this.#entitiesByType.getValuesAsync(this.#typeKey(contract, scope, entityType))) {
      seen.add(corrHex);
    }
    const keys = [...seen].map(hex => Buffer.from(hex, 'hex'));
    const live = await Promise.all(keys.map(k => this.isTerminated(contract, scope, entityType, k)));
    return keys.filter((_, i) => !live[i]);
  }

  /** Permanently mark an entity terminated. Idempotent. Facts are retained; the entity drops out of {@link activeEntities}. */
  terminate(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
  ): Promise<void> {
    return this.#terminated.set(this.#entityKey(contract, scope, entityType, correlationKey), Buffer.from([1]));
  }

  async isTerminated(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
  ): Promise<boolean> {
    return (
      (await this.#terminated.getAsync(this.#entityKey(contract, scope, entityType, correlationKey))) !== undefined
    );
  }

  #typeKey(contract: AztecAddress, scope: AztecAddress, entityType: EntityTypeId): string {
    return `${contract.toString()}:${scope.toString()}:${entityType.toString()}`;
  }

  #entityKey(contract: AztecAddress, scope: AztecAddress, entityType: EntityTypeId, correlationKey: Buffer): string {
    return `${contract.toString()}:${scope.toString()}:${entityType.toString()}:${correlationKey.toString('hex')}`;
  }

  // Keys on the raw payload bytes rather than a payloadHash: correct dedup with no crypto
  // dependency, since payloads are small here. The anchor is part of the key, so the same payload
  // re-mined on a competing fork (different blockHash) yields a distinct row.
  #dedupKey(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    factType: FactTypeId,
    correlationKey: Buffer,
    payload: Buffer,
    anchor: Anchor | null,
  ): string {
    const base = `${this.#entityKey(contract, scope, entityType, correlationKey)}:${factType.toString()}:${payload.toString('hex')}`;
    return anchor ? `${base}:${anchor.blockNumber}:${anchor.blockHash}` : base;
  }

  #serialize(factType: FactTypeId, payload: Buffer, anchor: Anchor | null): Buffer {
    const hasAnchor = anchor ? 1 : 0;
    const blockNumber = anchor ? anchor.blockNumber : 0;
    const blockHash = anchor ? anchor.blockHash : '';
    return serializeToBuffer(factType, hasAnchor, blockNumber, blockHash, payload.length, payload);
  }

  #deserialize(buf: Buffer): StoredFact {
    const reader = BufferReader.asReader(buf);
    const factType = Fr.fromBuffer(reader);
    const hasAnchor = reader.readNumber();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readString();
    const payloadLen = reader.readNumber();
    const payload = reader.readBytes(payloadLen);
    const anchor = hasAnchor ? { blockNumber, blockHash } : null;
    return { factType, payload, anchor };
  }
}
