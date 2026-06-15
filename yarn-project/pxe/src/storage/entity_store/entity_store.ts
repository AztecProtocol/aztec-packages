import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { EntityKey, EntityKeyStr, EntityTypeKey, EntityTypeKeyStr, OriginBlock } from './entity_keys.js';
import { StoredEntity } from './stored_entity.js';
import { type Fact, type FactKeyStr, StoredFact, deserializeFact, factKeyStrOf, serializeFact } from './stored_fact.js';

type JobId = string;
type BlockNum = number;
type StoredEntityBuffer = Buffer;
type FactBuffer = Buffer;

/** An entity as returned by the store: its key and body, plus its facts in creation order. */
export type Entity = { key: EntityKey; body: Fr[]; facts: Fact[] };

/** Internal auxiliary type to deal with fact ordering and idempotency */
type EntityWithFacts = { key: EntityKey; body: Fr[]; facts: Map<FactKeyStr, Fact> };

/** A pending mutation for a job: create an entity, record a fact, or terminate (delete) an entity. */
type StagedOp =
  | { kind: 'createEntity'; entity: StoredEntity }
  | { kind: 'record'; fact: StoredFact }
  | { kind: 'terminate'; key: EntityKey };

/**
 * Stores immutable facts about entities, isolated by contract and scope.
 *
 * Both entities and facts can be retractable or non-retractable. They are retractable if they are associated to an
 * origin block; they are non-retractable if they are not associated to an origin block.
 *
 * Retractable entities and all their facts are removed from the store when their origin block is pruned (typically due
 * to a reorg). Retractable facts are likewise removed from the store when their origin block is pruned.
 *
 * Conversely, non-retractable entities and facts survive reorgs. Non-retractable entities must then be explicitly
 * terminated, so as not to keep consuming resources (storage and compute) indefinitely.
 *
 * Order of facts in an entity is stable, respecting original creation order.
 *
 * This enables Aztec.nr to implement complex workflows such as offchain reception or partial note processing by
 * storing structured data that is guaranteed to exist conditionally to certain blocks being included in the chain,
 * while leaving the complexity of ensuring said guarantees to PXE.
 *
 * A key design driver is that PXE knows nothing about the actual entity and fact contents: it just manages enough
 * metadata to provide the guarantees mentioned above. That way, concepts such as offchain delivery or partial notes
 * are completely defined by Aztec.nr, opening the door to further extension without the need for ad-hoc PXE support.
 *
 * As with most other PXE stores, writes are staged per-job and flushed atomically on commit.
 */
export class EntityStore implements StagedStore {
  readonly storeName: string = 'entity';

  #store: AztecAsyncKVStore;

  /** Primary entity records; each holds the entity body and optional origin block. */
  #entities: AztecAsyncMap<EntityKeyStr, StoredEntityBuffer>;

  /** Index for delete-on-prune of retractable entities (those with an origin block). */
  #entitiesByBlock: AztecAsyncMultiMap<BlockNum, EntityKeyStr>;

  /** Primary fact records, deduplicated by fact key. */
  #facts: AztecAsyncMap<FactKeyStr, FactBuffer>;

  /** Index for efficient entity-level fold. */
  #factsByEntity: AztecAsyncMultiMap<EntityKeyStr, FactKeyStr>;

  /** Index for delete-on-prune (retractable facts only). */
  #factsByBlock: AztecAsyncMultiMap<BlockNum, FactKeyStr>;

  /** Monotonic counter assigning each newly committed fact its creation-order sequence number. */
  #factSeq: AztecAsyncSingleton<number>;

  /** Job uncommitted data */
  #opsForJob: Map<JobId, StagedOp[]>;

  /** Per-job locks */
  #jobLocks: Map<JobId, Semaphore>;

  logger = createLogger('entity_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#entities = store.openMap('entities');
    this.#entitiesByBlock = store.openMultiMap('entities_by_block');
    this.#facts = store.openMap('facts');
    this.#factsByEntity = store.openMultiMap('facts_by_entity');
    this.#factsByBlock = store.openMultiMap('facts_by_block');
    this.#factSeq = store.openSingleton('fact_seq');
    this.#opsForJob = new Map();
    this.#jobLocks = new Map();
  }

  /**
   * Creates an entity.
   *
   * If `originBlock === undefined`, the entity is non-retractable: it survives reorgs. A defined origin block makes the
   * entity retractable: on a prune above its block, the entity and all its facts are deleted.
   */
  createEntity(
    entityKey: EntityKey,
    entityBody: Fr[],
    originBlock: OriginBlock | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, async () => {
      if (await this.#entityExists(entityKey, jobId)) {
        throw new Error(`Cannot create an already existing entity ${entityKey.toString()}`);
      }
      this.#stagedOpsFor(jobId).push({
        kind: 'createEntity',
        entity: new StoredEntity(entityKey, entityBody, originBlock),
      });
    });
  }

  /**
   * Records a fact.
   *
   * Rejects if its entity does not exist.
   *
   * `originBlock === undefined` marks the fact non-retractable (it survives reorgs); a defined origin block ties the
   * fact to a specific block and it will be deleted on prune.
   *
   * Facts are returned in creation order by the getEntity and getEntities read methods.
   *
   * Idempotent: re-recording an identical fact (same entity, fact type, payload, and origin block) is a no-op,
   * keeping its creation position. The same payload tied to a different origin block is a distinct fact.
   */
  recordFact(
    entityKey: EntityKey,
    factTypeId: Fr,
    payload: Fr[],
    originBlock: OriginBlock | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, async () => {
      if (!(await this.#entityExists(entityKey, jobId))) {
        throw new Error(`Cannot record a fact for non-existent entity ${entityKey.toString()}`);
      }
      this.#stagedOpsFor(jobId).push({
        kind: 'record',
        fact: new StoredFact(entityKey, factTypeId, payload, originBlock),
      });
    });
  }

  /**
   * Terminate an entity, making it (and all its facts) unavailable.
   *
   * Throws if the entity does not exist.
   */
  terminateEntity(key: EntityKey, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, async () => {
      if (!(await this.#entityExists(key, jobId))) {
        throw new Error(`Cannot terminate a non-existent entity ${key.toString()}`);
      }
      this.#stagedOpsFor(jobId).push({ kind: 'terminate', key });
    });
  }

  /**
   * Returns one entity, if found.
   */
  async getEntity(key: EntityKey, jobId: string): Promise<Entity | undefined> {
    const entityKey = key.toString();
    const entitiesAndFactsFromDb = await this.#store.transactionAsync(async () => {
      const entities = await this.#readEntitiesFromDb(entityKey);
      return this.#readFactsFromDb(entities);
    });

    const entity = this.#foldStagedOps(entitiesAndFactsFromDb, jobId).get(entityKey);
    if (!entity) {
      return undefined;
    }

    return { key, body: entity.body, facts: Array.from(entity.facts.values()) };
  }

  /**
   * Returns all active entities of a given type, together with their facts in creation order.
   */
  async getEntities(entityTypeKey: EntityTypeKey, jobId: string): Promise<Entity[]> {
    const typeKey = entityTypeKey.toString();

    const entitiesAndFactsFromDb = await this.#readEntitiesAndFactsFromDbByType(typeKey);

    // Combine DB state with staged state; foldStagedOps keeps the result scoped to this type.
    const result: Entity[] = [];
    for (const { key, body, facts } of this.#foldStagedOps(entitiesAndFactsFromDb, jobId, typeKey).values()) {
      result.push({ key, body, facts: Array.from(facts.values()) });
    }

    return result;
  }

  /**
   * Commits all staged operations for the given job to persistent storage.
   *
   * Must be called inside a transaction owned by the caller (JobCoordinator wraps all commits in a single
   * transactionAsync, and IndexedDB does not support nested transactions).
   *
   * DO NOT call `#withJobLock` here: awaiting the lock creates a microtask boundary that causes IndexedDB to
   * auto-commit the outer transaction.
   */
  async commit(jobId: string): Promise<void> {
    for (const op of this.#stagedOpsFor(jobId)) {
      switch (op.kind) {
        case 'createEntity': {
          const entityKey = op.entity.key.toString();
          // Defensive, would only be a problem if we increase job concurrency for the same contract and scope.
          if (await this.#entities.hasAsync(entityKey)) {
            throw new Error(`Cannot commit createEntity for an already existing entity ${entityKey}`);
          }
          await this.#entities.set(entityKey, op.entity.toBuffer());
          if (op.entity.originBlock !== undefined) {
            await this.#entitiesByBlock.set(op.entity.originBlock.blockNumber, entityKey);
          }
          break;
        }
        case 'record': {
          const factKey = factKeyStrOf(op.fact);
          // Idempotent: re-recording an identical fact is a no-op.
          if (await this.#facts.hasAsync(factKey)) {
            this.logger.debug(`Ignoring already recorded fact`, { factKey });
            break;
          }
          const seq = await this.#nextFactSeq();
          await this.#facts.set(factKey, serializeFact(seq, op.fact));
          await this.#factsByEntity.set(op.fact.key.toString(), factKey);
          if (op.fact.originBlock !== undefined) {
            await this.#factsByBlock.set(op.fact.originBlock.blockNumber, factKey);
          }
          break;
        }
        case 'terminate':
          await this.#deleteEntity(op.key.toString());
          break;
      }
    }
    this.#clearJobData(jobId);
  }

  /** Discards all staged operations for the given job without persisting them. */
  discardStaged(jobId: string): Promise<void> {
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  /**
   * Removes every entity and fact associated to blocks over height `toBlock`.
   *
   * Non-retractable entities and facts are untouched. Must run inside a caller-owned transaction (because it needs to
   * share the transaction with other stores and IndexedDB has no nested transactions).
   *
   * Throws if any job is in flight (has accessed the store and not yet committed or discarded), since rolling back
   * mid-job could re-introduce records originating from deleted blocks or change state underneath a job's view.
   */
  async rollback(toBlock: BlockNum): Promise<void> {
    if (this.#opsForJob.size > 0) {
      throw new Error('PXE entity store rollback is not allowed while jobs are running');
    }

    // Delete retractable entities originating above toBlock. Snapshot before mutating so we never delete from the
    // multimap we are iterating.
    const entitiesToRetract: EntityKeyStr[] = [];
    for await (const [, entityKey] of this.#entitiesByBlock.entriesAsync({ start: toBlock + 1 })) {
      entitiesToRetract.push(entityKey);
    }
    for (const entityKey of entitiesToRetract) {
      await this.#deleteEntity(entityKey);
    }

    // Delete remaining retractable facts originating above toBlock.
    const factsToRetract: { block: BlockNum; factKey: FactKeyStr }[] = [];
    for await (const [block, factKey] of this.#factsByBlock.entriesAsync({ start: toBlock + 1 })) {
      factsToRetract.push({ block, factKey });
    }
    for (const { block, factKey } of factsToRetract) {
      const buf = await this.#facts.getAsync(factKey);
      if (!buf) {
        continue;
      }
      const { fact } = deserializeFact(buf);
      const entityKey = fact.key.toString();
      await this.#facts.delete(factKey);
      await this.#factsByBlock.deleteValue(block, factKey);
      await this.#factsByEntity.deleteValue(entityKey, factKey);
    }
    this.logger.verbose('rolled back entity store', {
      removedEntities: entitiesToRetract.length,
      removedFacts: factsToRetract.length,
      toBlock,
    });
  }

  /**
   * Whether the entity exists.
   */
  async #entityExists(key: EntityKey, jobId: string): Promise<boolean> {
    const entityKey = key.toString();
    const buf = await this.#store.transactionAsync(() => this.#entities.getAsync(entityKey));
    // Implementation note: the lines below are a bit boilerplatey, but they let us reuse #foldStagedOps and keep it
    // ergonomic for the more central `getEntity` and `getEntities` functions, so I settled for this tradeoff.
    const committed = new Map<EntityKeyStr, EntityWithFacts>();
    if (buf) {
      const stored = StoredEntity.fromBuffer(buf);
      committed.set(entityKey, { key: stored.key, body: stored.body, facts: new Map<FactKeyStr, Fact>() });
    }
    return this.#foldStagedOps(committed, jobId).has(entityKey);
  }

  /**
   * Reads every entity of the given type with its facts from the db.
   *
   * Note entity keys are `${typeKey}:${entityId}`, which lets us filter by type without additional indexes.
   */
  #readEntitiesAndFactsFromDbByType(typeKey: EntityTypeKeyStr) {
    return this.#store.transactionAsync(async () => {
      // The values ride along with the keys on this single cursor pass, so there is no need to re-read each entity.
      // Snapshot before issuing the fact point reads so we never interleave reads with a live cursor.
      const entities = new Map<EntityKeyStr, StoredEntity>();
      for await (const [entityKey, buf] of this.#entities.entriesAsync({ start: `${typeKey}:`, end: `${typeKey};` })) {
        entities.set(entityKey, StoredEntity.fromBuffer(buf));
      }
      return await this.#readFactsFromDb(entities);
    });
  }

  /**
   * Reads a single entity record (without its facts) by key into a 0-or-1-entry map — the input shape
   * {@link #readFactsFromDb} consumes. A missing record yields an empty map. Reads are not wrapped in a transaction:
   * the caller owns the transaction boundary.
   */
  async #readEntitiesFromDb(entityKey: EntityKeyStr): Promise<Map<EntityKeyStr, StoredEntity>> {
    const entities = new Map<EntityKeyStr, StoredEntity>();
    const buf = await this.#entities.getAsync(entityKey);
    if (buf !== undefined) {
      entities.set(entityKey, StoredEntity.fromBuffer(buf));
    }
    return entities;
  }

  /**
   * Attaches each entity's committed facts (in creation order), returning the entities-with-facts keyed by entity key.
   * Callers supply only entities that exist, so every input yields an output pair. Reads are not wrapped in a
   * transaction: the caller owns the transaction boundary.
   */
  async #readFactsFromDb(entities: Map<EntityKeyStr, StoredEntity>): Promise<Map<EntityKeyStr, EntityWithFacts>> {
    const result = new Map<EntityKeyStr, EntityWithFacts>();
    for (const [eKey, entity] of entities) {
      result.set(eKey, { key: entity.key, body: entity.body, facts: await this.#loadCommittedFacts(eKey) });
    }
    return result;
  }

  /**
   * Loads the committed facts for an entity keyed by their dedup fact key, in creation order. Caller may wrap in a
   * transaction.
   */
  async #loadCommittedFacts(eKey: EntityKeyStr): Promise<Map<FactKeyStr, Fact>> {
    // Snapshot the index before issuing point reads so we never interleave reads with a live cursor (IndexedDB
    // cursors are sensitive to what runs between iterations).
    const fKeys: FactKeyStr[] = [];
    for await (const fKey of this.#factsByEntity.getValuesAsync(eKey)) {
      fKeys.push(fKey);
    }
    const loaded: { fKey: FactKeyStr; seq: number; fact: StoredFact }[] = [];
    for (const fKey of fKeys) {
      const buf = await this.#facts.getAsync(fKey);
      if (!buf) {
        // A #factsByEntity entry must always reference a live #facts entry; a missing one means the indexes are
        // corrupt, so fail loudly rather than silently drop the fact.
        throw new Error(`Fact not found for factKey ${fKey}`);
      }
      const { seq, fact } = deserializeFact(buf);
      loaded.push({ fKey, seq, fact });
    }
    // Multimap value order is backend-dependent (insertion order on IndexedDB, value-sorted on LMDB); sort by the
    // commit-assigned sequence so facts always come back in creation order.
    loaded.sort((a, b) => a.seq - b.seq);
    return new Map(loaded.map(({ fKey, fact }) => [fKey, fact.toFact()]));
  }

  /**
   * Replays a job's staged ops over a committed set of entities-with-facts for read-your-writes, returning the current
   * set keyed by entity key (the input, and its per-entity fact maps, are not mutated). In one pass: a createEntity
   * surfaces the entity with no facts (replacing it if a terminate cleared it first), a terminate removes the entity
   * and its facts, a record adds a fact to its entity if absent (re-records are no-ops, mirroring commit). Surfaces
   * entities staged for creation that are not committed yet; a record whose entity is absent (e.g. concurrently
   * terminated by another job) is dropped.
   *
   * When `typeKey` is given, staged creations of other types are ignored, so the result holds only that type — callers
   * scoped to a type need no further filtering. Callers reading a single entity omit it and pick their key out.
   */
  #foldStagedOps(
    committed: Map<EntityKeyStr, EntityWithFacts>,
    jobId: string,
    typeKey?: EntityTypeKeyStr,
  ): Map<EntityKeyStr, EntityWithFacts> {
    const result = new Map<EntityKeyStr, EntityWithFacts>();
    for (const [entityKey, { key, body, facts }] of committed) {
      result.set(entityKey, { key, body, facts: new Map(facts) });
    }
    for (const op of this.#stagedOpsFor(jobId)) {
      switch (op.kind) {
        case 'createEntity':
          if (typeKey === undefined || op.entity.key.entityTypeKey().toString() === typeKey) {
            result.set(op.entity.key.toString(), {
              key: op.entity.key,
              body: op.entity.body,
              facts: new Map<FactKeyStr, Fact>(),
            });
          }
          break;
        case 'terminate':
          result.delete(op.key.toString());
          break;
        case 'record': {
          const current = result.get(op.fact.key.toString());
          const fKey = factKeyStrOf(op.fact);
          if (current && !current.facts.has(fKey)) {
            current.facts.set(fKey, op.fact.toFact());
          }
          break;
        }
      }
    }
    return result;
  }

  /** Returns the next fact sequence number, persisting the incremented counter. */
  async #nextFactSeq(): Promise<number> {
    const next = ((await this.#factSeq.getAsync()) ?? 0) + 1;
    await this.#factSeq.set(next);
    return next;
  }

  /**
   * Deletes an entity wholesale from every index: its record, all its facts, and the scope/block index entries.
   * Called during commit for 'terminate' ops and during pass 1 of rollback for pruned retractable entities.
   */
  async #deleteEntity(entityKey: EntityKeyStr): Promise<void> {
    const fKeys: FactKeyStr[] = [];
    for await (const fKey of this.#factsByEntity.getValuesAsync(entityKey)) {
      fKeys.push(fKey);
    }
    for (const fKey of fKeys) {
      const buf = await this.#facts.getAsync(fKey);
      if (!buf) {
        // A #factsByEntity entry must always reference a live #facts entry; a missing one means the indexes are
        // corrupt, so fail loudly rather than silently skip cleanup.
        throw new Error(`Fact not found for factKey ${fKey}`);
      }
      const { fact } = deserializeFact(buf);
      await this.#facts.delete(fKey);
      await this.#factsByEntity.deleteValue(entityKey, fKey);
      if (fact.originBlock !== undefined) {
        await this.#factsByBlock.deleteValue(fact.originBlock.blockNumber, fKey);
      }
    }
    const entityBuf = await this.#entities.getAsync(entityKey);
    if (entityBuf) {
      const entity = StoredEntity.fromBuffer(entityBuf);
      await this.#entities.delete(entityKey);
      if (entity.originBlock !== undefined) {
        await this.#entitiesByBlock.deleteValue(entity.originBlock.blockNumber, entityKey);
      }
    }
  }

  /**
   * Returns the job's staged-ops array, creating it on first access.
   * */
  #stagedOpsFor(jobId: string): StagedOp[] {
    let ops = this.#opsForJob.get(jobId);
    if (ops === undefined) {
      ops = [];
      this.#opsForJob.set(jobId, ops);
    }
    return ops;
  }

  #clearJobData(jobId: string) {
    this.#opsForJob.delete(jobId);
    this.#jobLocks.delete(jobId);
  }

  async #withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    let lock = this.#jobLocks.get(jobId);
    if (!lock) {
      lock = new Semaphore(1);
      this.#jobLocks.set(jobId, lock);
    }
    await lock.acquire();
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }
}
