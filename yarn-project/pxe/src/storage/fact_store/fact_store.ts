import { sha256 } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { Origin, WithOrigin } from '../foundation/origin.js';
import { type CanonicalityCheck, filterCanonical } from '../foundation/origin_read.js';

/** Stable identifier for an entity type. */
export type EntityTypeId = Fr;
/** Stable identifier for a fact type. */
export type FactTypeId = Fr;

/** One stored fact: its type, opaque payload, and the chain position that produced it (or null). */
export type StoredFact = { factType: FactTypeId; payload: Buffer; origin: Origin | null };

/** In-memory record of a put queued for a job's commit. Carries the precomputed keys so commit is index-free. */
type StagedFact = {
  factType: FactTypeId;
  payload: Buffer;
  origin: Origin | null;
  entityKey: string;
  typeKey: string;
  correlationKeyHex: string;
};

/** Everything one in-progress job has queued on this store. */
type StagedJob = {
  /** Facts put during this job, keyed by dedupKey so re-puts overwrite. */
  puts: Map<string, StagedFact>;
  /** Entities terminated during this job. */
  terminations: Set<string>;
};

/**
 * Appends facts and reads back the currently-canonical fact set for one entity.
 * Retractable facts (those with an origin) are filtered by the canonicality predicate; non-retractable facts are
 * always visible.
 *
 * Writes are staged per job — they live in an in-memory map until `commit(jobId)` promotes them to KV storage,
 * or `discardStaged(jobId)` drops them. Reads observe both committed KV state and the calling job's staged state
 * (uncommitted writes by other jobs are not visible). See {@link StagedStore}.
 */
export class FactStore implements StagedStore {
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

  /** jobId -> queued writes that have not yet been committed. */
  #staged: Map<string, StagedJob> = new Map();

  constructor(store: AztecAsyncKVStore, chain: CanonicalityCheck) {
    this.#store = store;
    this.#chain = chain;
    this.#facts = store.openMap('facts');
    this.#factsByEntity = store.openMultiMap('facts_by_entity');
    this.#entitiesByType = store.openMultiMap('facts_entities_by_type');
    this.#terminated = store.openMap('facts_terminated');
  }

  /**
   * Insert a fact, scoped to a (contract, scope) pair. Idempotent: re-putting the same row key is a no-op overwrite.
   * The write lives in this job's staging until commit.
   */
  put(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    factType: FactTypeId,
    correlationKey: Buffer,
    payload: Buffer,
    origin: Origin | null,
    jobId: string,
  ): Promise<void> {
    const dedupKey = this.#dedupKey(contract, scope, entityType, factType, correlationKey, payload, origin);
    const entityKey = this.#entityKey(contract, scope, entityType, correlationKey);
    const typeKey = this.#typeKey(contract, scope, entityType);
    const correlationKeyHex = correlationKey.toString('hex');
    this.#getJobStaging(jobId).puts.set(dedupKey, {
      factType,
      payload,
      origin,
      entityKey,
      typeKey,
      correlationKeyHex,
    });
    return Promise.resolve();
  }

  /**
   * All facts for one (contract, scope, entity) that are currently canonical (retractable facts filtered,
   * non-retractable kept). Includes facts staged in this job that have not yet been committed.
   */
  async loadCanonicalFactSet(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
    jobId: string,
  ): Promise<StoredFact[]> {
    const entityKey = this.#entityKey(contract, scope, entityType, correlationKey);

    // Read the committed facts for this entity.
    const dbResult = await this.#store.transactionAsync(async () => {
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
      return { seen, facts: buffers.filter((b): b is Buffer => b !== undefined).map(b => this.#deserialize(b)) };
    });

    // Layer this job's staged puts on top, skipping any dedupKeys that already came back from the DB.
    const allFacts: StoredFact[] = [...dbResult.facts];
    const staging = this.#staged.get(jobId);
    if (staging) {
      for (const [dedupKey, fact] of staging.puts) {
        if (fact.entityKey === entityKey && !dbResult.seen.has(dedupKey)) {
          allFacts.push({ factType: fact.factType, payload: fact.payload, origin: fact.origin });
        }
      }
    }

    const nonRetractable = allFacts.filter(f => f.origin === null);
    const retractable = allFacts.filter((f): f is WithOrigin<StoredFact> => f.origin !== null);
    const canonical = await filterCanonical(this.#chain, retractable);
    return [...nonRetractable, ...canonical];
  }

  /**
   * Correlation keys of all entities of `entityType` for `(contract, scope)` that have at least one fact, minus
   * those that are terminated. Includes entities first introduced by this job's staged puts and applies this job's
   * staged terminations.
   */
  async activeEntities(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    jobId: string,
  ): Promise<Buffer[]> {
    const typeKey = this.#typeKey(contract, scope, entityType);

    const corrSet = new Set<string>();
    for await (const corrHex of this.#entitiesByType.getValuesAsync(typeKey)) {
      corrSet.add(corrHex);
    }

    const staging = this.#staged.get(jobId);
    if (staging) {
      for (const fact of staging.puts.values()) {
        if (fact.typeKey === typeKey) {
          corrSet.add(fact.correlationKeyHex);
        }
      }
    }

    const keys = [...corrSet].map(hex => Buffer.from(hex, 'hex'));
    const live = await Promise.all(keys.map(k => this.isTerminated(contract, scope, entityType, k, jobId)));
    return keys.filter((_, i) => !live[i]);
  }

  /**
   * Permanently mark an entity terminated. Idempotent. Facts are retained; the entity drops out of
   * {@link activeEntities}. The termination is staged on this job and applied on commit.
   */
  terminate(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
    jobId: string,
  ): Promise<void> {
    this.#getJobStaging(jobId).terminations.add(this.#entityKey(contract, scope, entityType, correlationKey));
    return Promise.resolve();
  }

  async isTerminated(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    correlationKey: Buffer,
    jobId: string,
  ): Promise<boolean> {
    const entityKey = this.#entityKey(contract, scope, entityType, correlationKey);
    const staging = this.#staged.get(jobId);
    if (staging?.terminations.has(entityKey)) {
      return true;
    }
    return (await this.#terminated.getAsync(entityKey)) !== undefined;
  }

  /**
   * Promote this job's staged puts and terminations to KV storage. Idempotent if the job has no staged data.
   * Must be called inside a `transactionAsync` opened by the caller (the JobCoordinator already wraps commits).
   */
  async commit(jobId: string): Promise<void> {
    const staging = this.#staged.get(jobId);
    if (!staging) {
      return;
    }
    for (const [dedupKey, fact] of staging.puts) {
      await this.#facts.set(dedupKey, this.#serialize(fact.factType, fact.payload, fact.origin));
      await this.#factsByEntity.set(fact.entityKey, dedupKey);
      await this.#entitiesByType.set(fact.typeKey, fact.correlationKeyHex);
    }
    for (const entityKey of staging.terminations) {
      await this.#terminated.set(entityKey, Buffer.from([1]));
    }
    this.#staged.delete(jobId);
  }

  /** Drop this job's staged data without applying it. Idempotent. */
  discardStaged(jobId: string): Promise<void> {
    this.#staged.delete(jobId);
    return Promise.resolve();
  }

  #getJobStaging(jobId: string): StagedJob {
    let staging = this.#staged.get(jobId);
    if (!staging) {
      staging = { puts: new Map(), terminations: new Set() };
      this.#staged.set(jobId, staging);
    }
    return staging;
  }

  #typeKey(contract: AztecAddress, scope: AztecAddress, entityType: EntityTypeId): string {
    return `${contract.toString()}:${scope.toString()}:${entityType.toString()}`;
  }

  #entityKey(contract: AztecAddress, scope: AztecAddress, entityType: EntityTypeId, correlationKey: Buffer): string {
    return `${contract.toString()}:${scope.toString()}:${entityType.toString()}:${correlationKey.toString('hex')}`;
  }

  // The payload is hashed rather than inlined: a fact payload can be large (an offchain `Received` fact packs 20
  // fields = 640 bytes), and this key is stored as a DUPSORT value in the entity index, where it is bounded by LMDB's
  // max key size. sha256 keeps the key fixed-size while preserving byte-exact dedup. The origin is part of the key, so
  // the same payload re-mined on a competing fork (different blockHash) yields a distinct row.
  #dedupKey(
    contract: AztecAddress,
    scope: AztecAddress,
    entityType: EntityTypeId,
    factType: FactTypeId,
    correlationKey: Buffer,
    payload: Buffer,
    origin: Origin | null,
  ): string {
    const payloadHash = sha256(payload).toString('hex');
    const base = `${this.#entityKey(contract, scope, entityType, correlationKey)}:${factType.toString()}:${payloadHash}`;
    return origin ? `${base}:${origin.blockNumber}:${origin.blockHash}` : base;
  }

  #serialize(factType: FactTypeId, payload: Buffer, origin: Origin | null): Buffer {
    const hasOrigin = origin ? 1 : 0;
    const blockNumber = origin ? origin.blockNumber : 0;
    const blockHash = origin ? origin.blockHash : '';
    return serializeToBuffer(factType, hasOrigin, blockNumber, blockHash, payload.length, payload);
  }

  #deserialize(buf: Buffer): StoredFact {
    const reader = BufferReader.asReader(buf);
    const factType = Fr.fromBuffer(reader);
    const hasOrigin = reader.readNumber();
    const blockNumber = reader.readNumber();
    const blockHash = reader.readString();
    const payloadLen = reader.readNumber();
    const payload = reader.readBytes(payloadLen);
    const origin = hasOrigin ? { blockNumber, blockHash } : null;
    return { factType, payload, origin };
  }
}
