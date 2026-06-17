import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { EntityKey, EntityTypeKey, OriginBlock } from './entity_store_keys.js';
import { StoredEntity } from './stored_entity.js';
import { type Fact, StoredFact, deserializeFact, factKeyStrOf, serializeFact } from './stored_fact.js';

type JobId = string;
type BlockNum = number;
type StoredEntityBuffer = Buffer;
type FactBuffer = Buffer;

/** Serialized form of an {@link EntityTypeKey} (`contract:scope:entityTypeId`), used as kv-store map keys. */
type EntityTypeKeyStr = string;

/** Serialized form of an {@link EntityKey} (`entityTypeKeyStr:entityId`), used as kv-store map keys. */
type EntityKeyStr = string;

/** Serialized form of a fact's identity (built by {@link factKeyStrOf}), used as kv-store map keys. */
type FactKeyStr = string;

/** An entity as returned by the store: its key and body, plus its facts in creation order. */
export type Entity = { key: EntityKey; body: Fr[]; facts: Fact[] };

/** Internal auxiliary type to deal with fact ordering and idempotency */
type EntityWithFacts = { key: EntityKey; body: Fr[]; facts: Map<FactKeyStr, Fact> };

/** A pending mutation for a job: create an entity, record a fact, or terminate (delete) an entity. */
type StagedOp =
  | { kind: 'createEntity'; entity: StoredEntity }
  | { kind: 'recordFact'; fact: StoredFact }
  | { kind: 'terminateEntity'; key: EntityKey };

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
   * Creates an entity. Idempotent, with first-write-wins semantics.
   *
   * If `originBlock === undefined`, the entity is non-retractable: it survives reorgs. A defined origin block makes the
   * entity retractable: on a prune above its block, the entity and all its facts are deleted.
   *
   * An entity is identified solely by its {@link EntityKey} (contract, scope, entityTypeId, entityId). If an entity
   * with that key already exists, this call is a no-op: the existing entity, its body, origin block or lackthereof,
   * and all its facts, are left untouched and the supplied `entityBody`/`originBlock` are ignored.
   *
   * Creating a duplicate key never throws, so callers may re-run creation unconditionally without first checking
   * existence. This matters because Noir has no exception handling: a throw on an existing key would abort the whole
   * utility run with no way to recover.
   *
   * Users that need different behavior (updating an entity, branching on its current state, or distinguishing
   * instances by block, to cite a few examples) must either read it first via {@link getEntity} / {@link getEntities}
   * and handle the preexisting case explicitly, encode the distinguishing data into the `entityId`, or leverage facts.
   */
  createEntity(
    entityKey: EntityKey,
    entityBody: Fr[],
    originBlock: OriginBlock | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#stagedOpsFor(jobId).push({
        kind: 'createEntity',
        entity: new StoredEntity(entityKey, entityBody, originBlock),
      });
      return Promise.resolve();
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
      if ((await this.getEntity(entityKey, jobId)) === undefined) {
        throw new Error(`Cannot record a fact for non-existent entity ${entityKey.toString()}`);
      }
      this.#stagedOpsFor(jobId).push({
        kind: 'recordFact',
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
      if ((await this.getEntity(key, jobId)) === undefined) {
        throw new Error(`Cannot terminate a non-existent entity ${key.toString()}`);
      }
      this.#stagedOpsFor(jobId).push({ kind: 'terminateEntity', key });
    });
  }

  /**
   * Returns one entity, if found.
   */
  async getEntity(key: EntityKey, jobId: string): Promise<Entity | undefined> {
    const entityKey = key.toString();
    const entitiesAndFactsFromDb = await this.#store.transactionAsync(async () => {
      const entities = await this.#readEntitiesFromDb([entityKey]);
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
    return Array.from(this.#foldStagedOps(entitiesAndFactsFromDb, jobId, typeKey).values(), ({ key, body, facts }) => ({
      key,
      body,
      facts: Array.from(facts.values()),
    }));
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
        case 'createEntity':
          await this.#commitEntity(op.entity);
          break;
        case 'recordFact':
          await this.#commitFact(op.fact);
          break;
        case 'terminateEntity':
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

    const removedEntities = await this.#retractEntities(toBlock);
    const removedFacts = await this.#retractFacts(toBlock);

    this.logger.verbose('rolled back entity store', { removedEntities, removedFacts, toBlock });
  }

  /**
   * Deletes every retractable entity (and all its facts) whose origin block is above `toBlock`, returning the count
   * removed. Snapshots the by-block index before mutating so we never delete from the multimap we are iterating.
   *
   * Requires to be run in a transactionAsync context.
   */
  async #retractEntities(toBlock: BlockNum): Promise<number> {
    const entitiesToRetract: EntityKeyStr[] = [];
    for await (const [, entityKey] of this.#entitiesByBlock.entriesAsync({ start: toBlock + 1 })) {
      entitiesToRetract.push(entityKey);
    }
    for (const entityKey of entitiesToRetract) {
      await this.#deleteEntity(entityKey);
    }
    return entitiesToRetract.length;
  }

  /**
   * Deletes retractable facts originating above `toBlock`, returning the number of by-block entries scanned.
   *
   *  Requires to be run in a transactionAsync context.
   */
  async #retractFacts(toBlock: BlockNum): Promise<number> {
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
      const entityKey = fact.entityKey.toString();
      await this.#facts.delete(factKey);
      await this.#factsByBlock.deleteValue(block, factKey);
      await this.#factsByEntity.deleteValue(entityKey, factKey);
    }
    return factsToRetract.length;
  }

  /**
   * Reads every entity and of the given type with its facts from the db.
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
   * Reads the given entity records by key into a Map keyed by entity key, skipping keys with no committed record.
   *
   * This is purely auxiliary function that produces the input shape {@link #readFactsFromDb} consumes, it exists
   * mainly for better readability of the store.
   *
   * Reads are not wrapped in a transaction: the caller owns the transaction boundary.
   */
  async #readEntitiesFromDb(entityKeys: EntityKeyStr[]): Promise<Map<EntityKeyStr, StoredEntity>> {
    const entities = new Map<EntityKeyStr, StoredEntity>();
    for (const entityKey of entityKeys) {
      const buf = await this.#entities.getAsync(entityKey);
      if (buf !== undefined) {
        entities.set(entityKey, StoredEntity.fromBuffer(buf));
      }
    }
    return entities;
  }

  /**
   * Attaches each entity's committed facts (in creation order), returning the entities-with-facts keyed by entity key.
   *
   * Reads are not wrapped in a transaction: the caller owns the transaction boundary.
   */
  async #readFactsFromDb(entities: Map<EntityKeyStr, StoredEntity>): Promise<Map<EntityKeyStr, EntityWithFacts>> {
    const result = new Map<EntityKeyStr, EntityWithFacts>();
    for (const [entityKey, entity] of entities) {
      result.set(entityKey, { key: entity.key, body: entity.body, facts: await this.#loadCommittedFacts(entityKey) });
    }
    return result;
  }

  /**
   * Loads the committed facts for an entity keyed by their fact key, in creation order.
   *
   * Caller must wrap in a transaction.
   */
  async #loadCommittedFacts(entityKey: EntityKeyStr): Promise<Map<FactKeyStr, Fact>> {
    // Snapshot the index to avoid IndexedDB transaction aliveness quirks.
    const factKeys: FactKeyStr[] = [];
    for await (const factKey of this.#factsByEntity.getValuesAsync(entityKey)) {
      factKeys.push(factKey);
    }

    const loaded: { factKey: FactKeyStr; seq: number; fact: StoredFact }[] = [];
    for (const factKey of factKeys) {
      const buf = await this.#facts.getAsync(factKey);
      if (!buf) {
        // Defensive: a #factsByEntity entry must always reference a live #facts entry. A missing one means the indexes are
        // corrupt.
        throw new Error(`Fact not found for factKey ${factKey}`);
      }
      const { seq, fact } = deserializeFact(buf);
      loaded.push({ factKey: factKey, seq, fact });
    }

    // Multimap value order is backend-dependent (insertion order on IndexedDB, value-sorted on LMDB). We sort by the
    // a sequence number so facts always come back in creation order without needing to resort to timestamps.
    loaded.sort((a, b) => a.seq - b.seq);
    return new Map(loaded.map(({ factKey, fact }) => [factKey, fact.toFact()]));
  }

  /**
   * Assembles the current view of a collection of entities together with its facts, combining the committed with
   * staged data.
   *
   * When `typeKey` is given, staged creations of other types are ignored, so the result holds only that type.
   */
  #foldStagedOps(
    committed: Map<EntityKeyStr, EntityWithFacts>,
    jobId: string,
    typeKey?: EntityTypeKeyStr,
  ): Map<EntityKeyStr, EntityWithFacts> {
    const result = new Map<EntityKeyStr, EntityWithFacts>();

    // Copy to avoid mutating contents of `committed`
    for (const [entityKey, { key, body, facts }] of committed) {
      result.set(entityKey, { key, body, facts: new Map(facts) });
    }
    for (const op of this.#stagedOpsFor(jobId)) {
      switch (op.kind) {
        case 'createEntity': {
          // First-write-wins idempotency: materialize only when absent, so a re-create never clobbers an existing
          // entity's body or facts (mirrors #commitEntity skipping an already-stored key).
          const entityKeyStr = op.entity.key.toString();
          if (
            (typeKey === undefined || op.entity.key.entityTypeKey().toString() === typeKey) &&
            !result.has(entityKeyStr)
          ) {
            result.set(entityKeyStr, {
              key: op.entity.key,
              body: op.entity.body,
              facts: new Map<FactKeyStr, Fact>(),
            });
          }
          break;
        }
        case 'terminateEntity':
          result.delete(op.key.toString());
          break;
        case 'recordFact': {
          const current = result.get(op.fact.entityKey.toString());
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
   * Writes a newly created entity to persistent storage.
   *
   * First-write-wins: if an entity with this key already exists, this is a no-op that leaves the existing record and
   * all of its facts untouched (see {@link createEntity}).
   */
  async #commitEntity(entity: StoredEntity): Promise<void> {
    const entityKey = entity.key.toString();
    if (await this.#entities.hasAsync(entityKey)) {
      return;
    }
    await this.#entities.set(entityKey, entity.toBuffer());
    if (entity.originBlock !== undefined) {
      await this.#entitiesByBlock.set(entity.originBlock.blockNumber, entityKey);
    }
  }

  /**
   * Writes a fact to persistent storage.
   */
  async #commitFact(fact: StoredFact): Promise<void> {
    const factKey = factKeyStrOf(fact);
    if (await this.#facts.hasAsync(factKey)) {
      this.logger.debug(`Ignoring already recorded fact`, { factKey });
      return;
    }
    const seq = await this.#nextFactSeq();
    await this.#facts.set(factKey, serializeFact(seq, fact));
    await this.#factsByEntity.set(fact.entityKey.toString(), factKey);
    if (fact.originBlock !== undefined) {
      await this.#factsByBlock.set(fact.originBlock.blockNumber, factKey);
    }
  }

  /**
   * Deletes an entity from persistent storage.
   */
  async #deleteEntity(entityKey: EntityKeyStr): Promise<void> {
    const factKeys: FactKeyStr[] = [];
    for await (const factKey of this.#factsByEntity.getValuesAsync(entityKey)) {
      factKeys.push(factKey);
    }
    for (const factKey of factKeys) {
      const buf = await this.#facts.getAsync(factKey);
      if (!buf) {
        // A #factsByEntity entry must always reference a live #facts entry; a missing one means the indexes are
        // corrupt, so fail loudly rather than silently skip cleanup.
        throw new Error(`Fact not found for factKey ${factKey}`);
      }
      const { fact } = deserializeFact(buf);
      await this.#facts.delete(factKey);
      await this.#factsByEntity.deleteValue(entityKey, factKey);
      if (fact.originBlock !== undefined) {
        await this.#factsByBlock.deleteValue(fact.originBlock.blockNumber, factKey);
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
