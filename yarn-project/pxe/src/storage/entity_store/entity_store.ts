import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { EntityKey, EntityKeyStr, OriginBlock, ScopeKey, ScopeKeyStr } from './entity_keys.js';
import { StoredEntity } from './stored_entity.js';
import { type Fact, type FactKeyStr, StoredFact, deserializeFact, factKeyStrOf, serializeFact } from './stored_fact.js';

type JobId = string;
type BlockNum = number;
type EntityIdStr = string;
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
  #entitiesByScope: AztecAsyncMultiMap<ScopeKeyStr, EntityIdStr>;

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
    this.#entitiesByScope = store.openMultiMap('entities_by_scope');
    this.#factsByBlock = store.openMultiMap('facts_by_block');
    this.#factSeq = store.openSingleton('fact_seq');
    this.#opsForJob = new Map();
    this.#jobLocks = new Map();
  }

  /**
   * Creates an entity.
   *
   * `originBlock === undefined` marks the entity non-retractable (it survives reorgs; only its own retractable facts
   * are pruned). A defined origin block marks the whole entity retractable: on a prune above its block, the entity and
   * all its facts are deleted.
   *
   * The entity becomes immediately active, independently of whether it owns any facts.
   *
   * Idempotent: creating an entity that already exists is a no-op (first write wins), keeping the existing body,
   * origin block and facts.
   */
  createEntity(
    entityKey: EntityKey,
    entityBody: Fr[],
    originBlock: OriginBlock | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#opsFor(jobId).push({ kind: 'createEntity', entity: new StoredEntity(entityKey, entityBody, originBlock) });
      return Promise.resolve();
    });
  }

  /**
   * Stages a fact for recording under the given job.
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
    return this.#withJobLock(jobId, () => {
      this.#opsFor(jobId).push({ kind: 'record', fact: new StoredFact(entityKey, factTypeId, payload, originBlock) });
      return Promise.resolve();
    });
  }

  /** Permanently delete an entity (and all its facts). Staged within the job; applied on commit. */
  terminateEntity(key: EntityKey, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#opsFor(jobId).push({ kind: 'terminate', key });
      return Promise.resolve();
    });
  }

  /**
   * Returns one entity's body together with its facts in creation order. The body is empty when no entity record
   * exists; facts are stored independently of entity records.
   *
   * @param key - The key identifying the entity.
   * @param jobId - The job whose staged writes are layered over committed state.
   */
  async getEntity(key: EntityKey, jobId: string): Promise<Entity> {
    const eKey = key.toString();
    const { entity, factsByKey } = await this.#store.transactionAsync(async () => {
      const entityBuf = await this.#entities.getAsync(eKey);
      return {
        entity: entityBuf ? StoredEntity.fromBuffer(entityBuf) : undefined,
        factsByKey: await this.#loadCommittedFacts(eKey),
      };
    });
    // The entity record and the fact set are updated independently by each op kind (a terminate clears both, but does
    // so in both replays at the same position in the op sequence), so replaying them separately is equivalent to a
    // single in-order replay.
    this.#replayFactOps(factsByKey, eKey, jobId);
    let current = entity;
    for (const op of this.#stagedOps(jobId)) {
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
    return { key, body: current?.body ?? [], facts: Array.from(factsByKey.values(), f => f.toFact()) };
  }

  /**
   * Returns all active entities under (contract, scope, entityTypeId) — entities that have an entity record and have
   * not been terminated — together with their facts in creation order. Entity presence is independent of whether the
   * entity owns any facts.
   *
   * This job's staged ops are layered over committed state for read-your-writes: a createEntity activates the entity
   * if absent (keeping any facts it already owns), a record adds a fact if absent, a terminate deactivates the entity.
   */
  async getEntities(scopeKey: ScopeKey, jobId: string): Promise<Entity[]> {
    const sKey = scopeKey.toString();
    // Ids staged for creation join the candidate set up front, so the committed-state load below also picks up any
    // facts already committed for them (facts are stored independently of entity records).
    const stagedCreatedIds: EntityIdStr[] = [];
    for (const op of this.#stagedOps(jobId)) {
      if (op.kind === 'createEntity' && op.entity.key.scopeKey().toString() === sKey) {
        stagedCreatedIds.push(op.entity.key.entityId.toString());
      }
    }
    const entities = await this.#store.transactionAsync(async () => {
      // Snapshot the scope index before issuing point reads so we never interleave reads with a live cursor.
      const committedIds: EntityIdStr[] = [];
      for await (const entityId of this.#entitiesByScope.getValuesAsync(sKey)) {
        committedIds.push(entityId);
      }
      const result = new Map<
        EntityIdStr,
        { entity: StoredEntity | undefined; factsByKey: Map<FactKeyStr, StoredFact> }
      >();
      for (const entityId of committedIds) {
        const eKey = `${sKey}:${entityId}`;
        const buf = await this.#entities.getAsync(eKey);
        if (!buf) {
          // An #entitiesByScope entry must always reference a live #entities entry; a missing one means the indexes
          // are corrupt, so fail loudly rather than surface a ghost entity or silently hide the corruption.
          throw new Error(`Entity not found for entityKey ${eKey}`);
        }
        result.set(entityId, {
          entity: StoredEntity.fromBuffer(buf),
          factsByKey: await this.#loadCommittedFacts(eKey),
        });
      }
      for (const entityId of stagedCreatedIds) {
        if (!result.has(entityId)) {
          result.set(entityId, {
            entity: undefined,
            factsByKey: await this.#loadCommittedFacts(`${sKey}:${entityId}`),
          });
        }
      }
      return result;
    });
    // Layer this job's staged ops over committed state. Each entity's fact set replays exactly as in getEntity;
    // entity-record presence (createEntity activates, terminate deactivates) replays separately, which is equivalent
    // to a single in-order replay because the two are updated independently by each op kind.
    for (const [entityId, e] of entities) {
      this.#replayFactOps(e.factsByKey, `${sKey}:${entityId}`, jobId);
    }
    for (const op of this.#stagedOps(jobId)) {
      switch (op.kind) {
        case 'createEntity': {
          const e =
            op.entity.key.scopeKey().toString() === sKey ? entities.get(op.entity.key.entityId.toString()) : undefined;
          if (e && e.entity === undefined) {
            e.entity = op.entity;
          }
          break;
        }
        case 'terminate': {
          const e = op.key.scopeKey().toString() === sKey ? entities.get(op.key.entityId.toString()) : undefined;
          if (e) {
            e.entity = undefined;
          }
          break;
        }
        case 'record':
          break;
      }
    }
    return Array.from(entities.values())
      .filter(e => e.entity !== undefined)
      .map(({ entity, factsByKey }) => ({
        key: entity!.key,
        body: entity!.body,
        facts: Array.from(factsByKey.values(), f => f.toFact()),
      }));
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
          // Idempotent: creating an existing entity is a no-op (first write wins). Keeping the earliest origin block
          // is what makes retraction correct: the entity must survive while its first derivation block is canonical.
          // A welcome side effect is that an entity's record never changes in place, so the by-block index can never
          // go stale.
          if (await this.#entities.hasAsync(eKey)) {
            this.logger.debug(`Ignoring createEntity for an already existing entity`, { entityKey: eKey, jobId });
            break;
          }
          await this.#entities.set(eKey, entity.toBuffer());
          await this.#entitiesByScope.set(entity.key.scopeKey().toString(), entity.key.entityId.toString());
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
   * has uncommitted staged writes, since rolling back mid-job could re-introduce records originating from deleted
   * blocks.
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
   * Replays a job's staged ops over a committed fact map for read-your-writes: a record adds a fact if absent
   * (re-records are no-ops, mirroring commit), a terminate clears the entity's facts. Order matters so a
   * terminate-then-record sequence resolves to the re-recorded fact. createEntity ops do not affect the fact set.
   */
  #replayFactOps(factsByKey: Map<FactKeyStr, StoredFact>, eKey: EntityKeyStr, jobId: string): void {
    for (const op of this.#stagedOps(jobId)) {
      switch (op.kind) {
        case 'record':
          if (op.fact.key.toString() === eKey && !factsByKey.has(factKeyStrOf(op.fact))) {
            factsByKey.set(factKeyStrOf(op.fact), op.fact);
          }
          break;
        case 'terminate':
          if (op.key.toString() === eKey) {
            factsByKey.clear();
          }
          break;
        case 'createEntity':
          break;
      }
    }
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
    await this.#entitiesByScope.deleteValue(key.scopeKey().toString(), key.entityId.toString());
  }

  #opsFor(jobId: string): StagedOp[] {
    let ops = this.#opsForJob.get(jobId);
    if (ops === undefined) {
      ops = [];
      this.#opsForJob.set(jobId, ops);
    }
    return ops;
  }

  /**
   * Read-only view of a job's staged ops for read-your-writes. Unlike {@link #opsFor}, it never creates an entry, so a
   * read for a job with no writes does not register a phantom in-flight job (which would trip the `rollback` guard).
   */
  #stagedOps(jobId: string): StagedOp[] {
    return this.#opsForJob.get(jobId) ?? [];
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
