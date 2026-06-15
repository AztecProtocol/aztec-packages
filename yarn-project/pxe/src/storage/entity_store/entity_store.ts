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

  /** Index for active-entity enumeration. */
  #entitiesByEntityType: AztecAsyncMultiMap<EntityTypeKeyStr, EntityKeyStr>;

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
    this.#entitiesByEntityType = store.openMultiMap('entities_by_entity_type');
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
      this.#opsFor(jobId).push({ kind: 'createEntity', entity: new StoredEntity(entityKey, entityBody, originBlock) });
    });
  }

  /**
   * Stages a fact for recording under the given job. The entity must be active in this job's view — committed to disk
   * (and not terminated earlier in this job) or staged for creation earlier in this same job — otherwise this rejects:
   * a fact can never exist without its entity.
   *
   * `originBlock === undefined` marks the fact non-retractable (it survives reorgs); a defined origin block ties the
   * fact to a specific block and it will be deleted on prune.
   *
   * Facts are returned in creation order by the read methods.
   *
   * Idempotent: re-recording an existing (entity, factType, payload) tuple is a no-op (first write wins), keeping
   * the fact's origin block and creation position.
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
      this.#opsFor(jobId).push({ kind: 'record', fact: new StoredFact(entityKey, factTypeId, payload, originBlock) });
    });
  }

  /**
   * Permanently delete an entity (and all its facts). Staged within the job; applied on commit. Rejects if the entity
   * is not active in this job's view — committed to disk (and not terminated earlier in this job) or staged for
   * creation earlier in this same job.
   */
  terminateEntity(key: EntityKey, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, async () => {
      if (!(await this.#entityExists(key, jobId))) {
        throw new Error(`Cannot terminate a non-existent entity ${key.toString()}`);
      }
      this.#opsFor(jobId).push({ kind: 'terminate', key });
    });
  }

  /**
   * Returns one entity's body together with its facts in creation order.
   *
   * @param key - The key identifying the entity.
   * @param jobId - The job whose staged writes are layered over committed state.
   */
  async getEntity(key: EntityKey, jobId: string): Promise<Entity> {
    const entityKey = key.toString();
    const entitiesInDb = await this.#store.transactionAsync(() => this.#readEntitiesAndFactsFromDb([entityKey]));
    const { entity, facts } = entitiesInDb.get(entityKey)!;

    // Since this store is append-only, we can compute the current job's view of an entity by reading it from the
    // persistent storage and "replaying" staged entity creation and termination ops, as well as staged facts.
    const currentEntity = this.#replayEntityOps(entity, entityKey, jobId);
    const currentFacts = this.#replayFactOps(facts, entityKey, jobId);

    return { key, body: currentEntity?.body ?? [], facts: Array.from(currentFacts.values(), f => f.toFact()) };
  }

  /**
   * Returns all active entities of a given type, together with their facts in creation order.
   */
  async getEntities(entityTypeKey: EntityTypeKey, jobId: string): Promise<Entity[]> {
    const typeKey = entityTypeKey.toString();

    const entitiesAndFacts = await this.#readEntitiesAndFactsFromDbByType(typeKey);

    for (const stagedEntity of this.#entitiesInStage(typeKey, jobId)) {
      const entityKey = stagedEntity.key.toString();
      if (!entitiesAndFacts.has(entityKey)) {
        entitiesAndFacts.set(entityKey, { entity: undefined, facts: new Map<FactKeyStr, StoredFact>() });
      }
    }

    // Replay each entity's record and fact set from staged state, exactly as in getEntity.
    const result: Entity[] = [];
    for (const [entityKey, { entity, facts }] of entitiesAndFacts) {
      const currentEntity = this.#replayEntityOps(entity, entityKey, jobId);

      // i.e.: entity was terminated in current job
      if (currentEntity === undefined) {
        continue;
      }

      const currentFacts = this.#replayFactOps(facts, entityKey, jobId);
      result.push({
        key: currentEntity.key,
        body: currentEntity.body,
        facts: Array.from(currentFacts.values(), f => f.toFact()),
      });
    }

    return result;
  }

  /**
   * Commits all staged operations for the given job to persistent storage.
   *
   * Must be called inside a transaction owned by the caller (JobCoordinator wraps all commits in a single
   * transactionAsync, and IndexedDB does not support nested transactions). Do not call #withJobLock here: awaiting
   * the lock creates a microtask boundary that causes IndexedDB to auto-commit the outer transaction.
   */
  async commit(jobId: string): Promise<void> {
    for (const op of this.#opsFor(jobId)) {
      switch (op.kind) {
        case 'createEntity': {
          const entity = op.entity;
          const eKey = entity.key.toString();
          // createEntity rejects duplicates at stage time, so a same-job duplicate never reaches here; this only fires
          // on a cross-job race where two jobs each stage a create for the same new entity and both reach commit. Keep
          // the first committed write: re-setting would add a duplicate entities_by_entity_type entry and let the
          // record change in place, staling the by-block index.
          if (await this.#entities.hasAsync(eKey)) {
            this.logger.debug(`Ignoring createEntity for an already existing entity`, { entityKey: eKey, jobId });
            break;
          }
          await this.#entities.set(eKey, entity.toBuffer());
          await this.#entitiesByEntityType.set(entity.key.entityTypeKey().toString(), eKey);
          if (entity.originBlock !== undefined) {
            await this.#entitiesByBlock.set(entity.originBlock.blockNumber, eKey);
          }
          break;
        }
        case 'record': {
          const fact = op.fact;
          const fKey = factKeyStrOf(fact);
          // Idempotent: re-recording an existing fact is a no-op (first write wins), mirroring createEntity above.
          // The fact keeps its earliest origin block and its original creation position.
          if (await this.#facts.hasAsync(fKey)) {
            this.logger.debug(`Ignoring already recorded fact`, { factKey: fKey, jobId });
            break;
          }
          const seq = await this.#nextFactSeq();
          await this.#facts.set(fKey, serializeFact(seq, fact));
          await this.#factsByEntity.set(fact.key.toString(), fKey);
          if (fact.originBlock !== undefined) {
            await this.#factsByBlock.set(fact.originBlock.blockNumber, fKey);
          }
          break;
        }
        case 'terminate':
          await this.#deleteEntity(op.key);
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
   * Delete-on-prune in two passes. Pass 1 deletes every retractable entity whose origin block is strictly above
   * `toBlock` wholesale: its body and every fact it owns, regardless of each fact's own flag. Pass 2 deletes any
   * remaining retractable fact originating above `toBlock` whose entity survived pass 1. Non-retractable entities and
   * facts are untouched (they never enter the by-block indexes). Must run inside a caller-owned transaction (the
   * reorg path wraps it with the sibling stores' rollbacks; IndexedDB has no nested transactions). Throws if any job
   * is in flight (has accessed the store and not yet committed or discarded), since rolling back mid-job could
   * re-introduce records originating from deleted blocks or change committed state underneath a job's view.
   */
  async rollback(toBlock: BlockNum): Promise<void> {
    if (this.#opsForJob.size > 0) {
      throw new Error('PXE entity store rollback is not allowed while jobs are running');
    }

    // Pass 1: delete retractable entities originating above toBlock wholesale. Snapshot before mutating so we never
    // delete from the multimap we are iterating.
    const orphanedEntities: EntityKeyStr[] = [];
    for await (const [, eKey] of this.#entitiesByBlock.entriesAsync({ start: toBlock + 1 })) {
      orphanedEntities.push(eKey);
    }
    const deletedEntities = new Set<EntityKeyStr>();
    let removedEntities = 0;
    for (const eKey of orphanedEntities) {
      const buf = await this.#entities.getAsync(eKey);
      if (!buf) {
        // An #entitiesByBlock entry must always reference a live #entities entry; a missing one means the indexes are
        // corrupt, so fail loudly rather than leave a ghost entity behind.
        throw new Error(`Entity not found for entityKey ${eKey}`);
      }
      const entity = StoredEntity.fromBuffer(buf);
      await this.#deleteEntity(entity.key);
      deletedEntities.add(eKey);
      removedEntities++;
    }

    // Pass 2: delete remaining retractable facts originating above toBlock whose entity survived pass 1. Pass 1 already
    // removed the facts_by_block entries of pruned entities, so any leftover entry here belongs to a surviving entity.
    const orphanedFacts: { block: BlockNum; fKey: FactKeyStr }[] = [];
    for await (const [block, fKey] of this.#factsByBlock.entriesAsync({ start: toBlock + 1 })) {
      orphanedFacts.push({ block, fKey });
    }
    let removedFacts = 0;
    for (const { block, fKey } of orphanedFacts) {
      const buf = await this.#facts.getAsync(fKey);
      if (!buf) {
        // A still-present by-block entry with no fact means the indexes are corrupt (pass 1 removes both the fact
        // and the by-block entry for pruned entities), so fail loudly rather than leave a dangling index entry.
        throw new Error(`Fact not found for factKey ${fKey}`);
      }
      const { fact } = deserializeFact(buf);
      const eKey = fact.key.toString();
      // Belt-and-braces: a fact whose entity was pruned in pass 1 must not be re-processed here. With #deleteEntity
      // clearing the by-block index this is unreachable, but the guard keeps pass 2 correct if that ever changes.
      if (deletedEntities.has(eKey)) {
        continue;
      }
      await this.#facts.delete(fKey);
      await this.#factsByBlock.deleteValue(block, fKey);
      await this.#factsByEntity.deleteValue(eKey, fKey);
      removedFacts++;
    }
    this.logger.verbose('rolled back entity store', { removedEntities, removedFacts, toBlock });
  }

  // ---- private helpers ----

  /** Returns the entities of the given type staged for creation under the given job. */
  #entitiesInStage(tKey: EntityTypeKeyStr, jobId: string): StoredEntity[] {
    const entities: StoredEntity[] = [];
    for (const op of this.#opsFor(jobId)) {
      if (op.kind === 'createEntity' && op.entity.key.entityTypeKey().toString() === tKey) {
        entities.push(op.entity);
      }
    }
    return entities;
  }

  /**
   * Whether the entity is active in the job's view: its committed record (if any) still exists after replaying the
   * job's staged createEntity/terminate ops. This is the same liveness the read methods compute, used to reject facts
   * for entities that do not (yet) exist.
   */
  async #entityExists(key: EntityKey, jobId: string): Promise<boolean> {
    const eKey = key.toString();
    const buf = await this.#store.transactionAsync(() => this.#entities.getAsync(eKey));
    const committed = buf ? StoredEntity.fromBuffer(buf) : undefined;
    return this.#replayEntityOps(committed, eKey, jobId) !== undefined;
  }

  /** Reads every committed entity of the given type with its facts, keyed by entity key, in one transaction. */
  #readEntitiesAndFactsFromDbByType(typeKey: EntityTypeKeyStr) {
    return this.#store.transactionAsync(async () => {
      const entityKeysInDb: EntityKeyStr[] = [];
      for await (const entityKey of this.#entitiesByEntityType.getValuesAsync(typeKey)) {
        entityKeysInDb.push(entityKey);
      }
      return await this.#readEntitiesAndFactsFromDb(entityKeysInDb);
    });
  }

  /**
   * Reads the committed records (undefined when none exists) and facts of the given entities from the database,
   * keyed by entity key. Reads are not wrapped in a transaction: the caller owns the transaction boundary.
   */
  async #readEntitiesAndFactsFromDb(
    eKeys: EntityKeyStr[],
  ): Promise<Map<EntityKeyStr, { entity: StoredEntity | undefined; facts: Map<FactKeyStr, StoredFact> }>> {
    const result = new Map<EntityKeyStr, { entity: StoredEntity | undefined; facts: Map<FactKeyStr, StoredFact> }>();
    for (const eKey of eKeys) {
      const entityBuf = await this.#entities.getAsync(eKey);
      result.set(eKey, {
        entity: entityBuf ? StoredEntity.fromBuffer(entityBuf) : undefined,
        facts: await this.#loadCommittedFacts(eKey),
      });
    }
    return result;
  }

  /**
   * Loads the committed facts for an entity keyed by their dedup fact key, in creation order. Caller may wrap in a
   * transaction.
   */
  async #loadCommittedFacts(eKey: EntityKeyStr): Promise<Map<FactKeyStr, StoredFact>> {
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
    return new Map(loaded.map(({ fKey, fact }) => [fKey, fact]));
  }

  /**
   * Replays a job's staged ops over a committed fact map for read-your-writes, returning a fresh map (the input is
   * not mutated): a record adds a fact if absent (re-records are no-ops, mirroring commit), a terminate clears the
   * entity's facts. Order matters so a terminate-then-record sequence resolves to the re-recorded fact. createEntity
   * ops do not affect the fact set.
   */
  #replayFactOps(
    committed: Map<FactKeyStr, StoredFact>,
    eKey: EntityKeyStr,
    jobId: string,
  ): Map<FactKeyStr, StoredFact> {
    const result = new Map(committed);
    for (const op of this.#opsFor(jobId)) {
      switch (op.kind) {
        case 'record':
          if (op.fact.key.toString() === eKey && !result.has(factKeyStrOf(op.fact))) {
            result.set(factKeyStrOf(op.fact), op.fact);
          }
          break;
        case 'terminate':
          if (op.key.toString() === eKey) {
            result.clear();
          }
          break;
        case 'createEntity':
          break;
      }
    }
    return result;
  }

  /**
   * Replays a job's staged ops over a committed entity record for read-your-writes, returning the resulting record:
   * a createEntity activates the entity if absent (re-creates are no-ops, mirroring commit), a terminate deactivates
   * it. Record ops do not affect the entity record.
   *
   * The entity record and its fact set are updated independently by each op kind (a terminate clears both, but does
   * so in this replay and in {@link #replayFactOps} at the same position in the op sequence), so replaying them
   * separately is equivalent to a single in-order replay.
   */
  #replayEntityOps(committed: StoredEntity | undefined, eKey: EntityKeyStr, jobId: string): StoredEntity | undefined {
    let current = committed;
    for (const op of this.#opsFor(jobId)) {
      switch (op.kind) {
        case 'createEntity':
          if (current === undefined && op.entity.key.toString() === eKey) {
            current = op.entity;
          }
          break;
        case 'terminate':
          if (op.key.toString() === eKey) {
            current = undefined;
          }
          break;
        case 'record':
          break;
      }
    }
    return current;
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
  async #deleteEntity(key: EntityKey): Promise<void> {
    const eKey = key.toString();
    const fKeys: FactKeyStr[] = [];
    for await (const fKey of this.#factsByEntity.getValuesAsync(eKey)) {
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
      await this.#factsByEntity.deleteValue(eKey, fKey);
      if (fact.originBlock !== undefined) {
        await this.#factsByBlock.deleteValue(fact.originBlock.blockNumber, fKey);
      }
    }
    const entityBuf = await this.#entities.getAsync(eKey);
    if (entityBuf) {
      const entity = StoredEntity.fromBuffer(entityBuf);
      await this.#entities.delete(eKey);
      if (entity.originBlock !== undefined) {
        await this.#entitiesByBlock.deleteValue(entity.originBlock.blockNumber, eKey);
      }
    }
    await this.#entitiesByEntityType.deleteValue(key.entityTypeKey().toString(), eKey);
  }

  /**
   * Returns the job's staged-ops array, creating it on first access. Any access registers the job as in flight, so a
   * read also pins the job until it commits or is discarded — and {@link rollback} refuses to run while it is pinned.
   * That is intentional: rolling back while a job holds a view of committed state could change that state underneath
   * the job.
   */
  #opsFor(jobId: string): StagedOp[] {
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
