import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSingleton } from '@aztec/kv-store';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import {
  type EntityCoords,
  type EntityKey,
  type OriginBlock,
  type ScopeCoords,
  type ScopeKey,
  entityKeyOf,
  scopeKeyOf,
} from './entity_keys.js';
import { StoredEntity } from './stored_entity.js';
import { type FactRowKey, StoredFact, deserializeFactRow, factRowKeyOf, serializeFactRow } from './stored_fact.js';

type JobId = string;
type BlockNum = number;
type EntityIdStr = string;
type StoredEntityBuffer = Buffer;
type FactRowBuffer = Buffer;

/** A pending mutation for a job: create an entity, record a fact, or terminate (delete) an entity. */
type StagedOp =
  | { kind: 'createEntity'; entity: StoredEntity }
  | { kind: 'record'; fact: StoredFact }
  | { kind: 'terminate'; coords: EntityCoords };

/**
 * Stores immutable facts about entities, grouped by contract, scope, entity type, and entity id.
 *
 * Append-only within a job commit. Retractable facts (those with an origin block) are deleted on block prune.
 * Non-retractable facts (originBlock === undefined) survive reorgs as external inputs. Writes are staged per-job and
 * flushed atomically on commit. Facts are returned in creation order.
 */
export class EntityStore implements StagedStore {
  readonly storeName: string = 'entity';

  #store: AztecAsyncKVStore;
  /** Primary entity records; each row holds the entity body and optional origin block. */
  #entities: AztecAsyncMap<EntityKey, StoredEntityBuffer>;
  /** Index for delete-on-prune of retractable entities (those with an origin block). */
  #entitiesByBlock: AztecAsyncMultiMap<BlockNum, EntityKey>;
  /** Primary fact records, deduplicated by row key. */
  #facts: AztecAsyncMap<FactRowKey, FactRowBuffer>;
  /** Index for efficient entity-level fold. */
  #factsByEntity: AztecAsyncMultiMap<EntityKey, FactRowKey>;
  /** Index for active-entity enumeration. */
  #entitiesByScope: AztecAsyncMultiMap<ScopeKey, EntityIdStr>;
  /** Index for delete-on-prune (retractable facts only). */
  #factsByBlock: AztecAsyncMultiMap<BlockNum, FactRowKey>;
  /** Monotonic counter assigning each newly committed fact its creation-order sequence number. */
  #factSeq: AztecAsyncSingleton<number>;

  #opsForJob: Map<JobId, StagedOp[]>;
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
   * Stages an entity record (with its own body and optional origin block) under the given job.
   *
   * `originBlock === undefined` marks the entity non-retractable (it survives reorgs; only its own retractable facts
   * are pruned). A defined origin block marks the whole entity retractable: on a prune above its block, the entity and
   * all its facts are deleted.
   *
   * The entity becomes immediately active, independently of whether it owns any facts. Re-creating an existing entity
   * overwrites its record (body and origin block, last write wins) and keeps the facts it already owns.
   */
  createEntity(coords: EntityCoords, body: Fr[], originBlock: OriginBlock | undefined, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, () => {
      const entity = new StoredEntity(
        coords.contractAddress,
        coords.scope,
        coords.entityTypeId,
        coords.entityId,
        body,
        originBlock,
      );
      this.#opsFor(jobId).push({ kind: 'createEntity', entity });
      return Promise.resolve();
    });
  }

  /**
   * Stages a fact for recording under the given job.
   *
   * `originBlock === undefined` marks the fact non-retractable (it survives reorgs); a defined origin block ties the
   * fact to a specific block and it will be deleted on prune.
   *
   * Facts are returned in creation order by the read methods. Idempotent: duplicate (entity, factType, payload)
   * tuples collapse to a single row via the dedup row key; a re-recorded fact keeps its original creation position
   * while its origin block is updated (last write wins).
   */
  recordFact(
    coords: EntityCoords,
    factTypeId: Fr,
    payload: Fr[],
    originBlock: OriginBlock | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      const fact = new StoredFact(
        coords.contractAddress,
        coords.scope,
        coords.entityTypeId,
        coords.entityId,
        factTypeId,
        payload,
        originBlock,
      );
      this.#opsFor(jobId).push({ kind: 'record', fact });
      return Promise.resolve();
    });
  }

  /** Permanently delete an entity (all its facts). Staged within the job; applied on commit. */
  terminateEntity(coords: EntityCoords, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#opsFor(jobId).push({ kind: 'terminate', coords });
      return Promise.resolve();
    });
  }

  /**
   * Returns one entity's body together with its facts in creation order.
   *
   * The body comes from the entity record (empty when no entity record exists); the facts come from the per-entity
   * fact index. This job's staged ops are layered over committed state for read-your-writes: a createEntity sets the
   * body, a record adds/dedups a fact, a terminate clears both body and facts.
   *
   * @param coords - The coordinates identifying the entity.
   * @param jobId - The job whose staged writes are layered over committed state.
   */
  async getEntity(coords: EntityCoords, jobId: string): Promise<{ body: Fr[]; facts: StoredFact[] }> {
    const eKey = entityKeyOf(coords);
    const { body, byRow } = await this.#store.transactionAsync(async () => {
      const entityBuf = await this.#entities.getAsync(eKey);
      return {
        body: entityBuf ? StoredEntity.fromBuffer(entityBuf).body : [],
        byRow: await this.#loadCommittedFacts(eKey),
      };
    });
    // The body and the fact set are updated independently by each op kind (a terminate clears both, but does so in
    // both replays at the same position in the op sequence), so replaying them separately is equivalent to a single
    // in-order replay.
    this.#replayFactOps(byRow, eKey, jobId);
    let currentBody = body;
    for (const op of this.#stagedOps(jobId)) {
      switch (op.kind) {
        case 'createEntity':
          if (entityKeyOf(op.entity) === eKey) {
            currentBody = op.entity.body;
          }
          break;
        case 'terminate':
          if (entityKeyOf(op.coords) === eKey) {
            currentBody = [];
          }
          break;
        case 'record':
          break;
      }
    }
    return { body: currentBody, facts: Array.from(byRow.values()) };
  }

  /**
   * Returns all active entities under (contract, scope, entityTypeId) — entities that have an entity record and have
   * not been terminated — together with their facts in creation order. Entity presence is independent of whether the
   * entity owns any facts.
   *
   * This job's staged ops are layered over committed state for read-your-writes: a createEntity activates the entity
   * (keeping any facts it already owns), a record adds/dedups a fact, a terminate deactivates the entity.
   */
  async getEntities(coords: ScopeCoords, jobId: string): Promise<{ entity: StoredEntity; facts: StoredFact[] }[]> {
    const sKey = scopeKeyOf(coords);
    // Ids staged for creation join the candidate set up front, so the committed-state load below also picks up any
    // facts already committed for them (facts are stored independently of entity records).
    const stagedCreatedIds: EntityIdStr[] = [];
    for (const op of this.#stagedOps(jobId)) {
      if (op.kind === 'createEntity' && scopeKeyOf(op.entity) === sKey) {
        stagedCreatedIds.push(op.entity.entityId.toString());
      }
    }
    const entities = await this.#store.transactionAsync(async () => {
      // Snapshot the scope index before issuing point reads so we never interleave reads with a live cursor.
      const committedIds: EntityIdStr[] = [];
      for await (const entityId of this.#entitiesByScope.getValuesAsync(sKey)) {
        committedIds.push(entityId);
      }
      const result = new Map<EntityIdStr, { entity: StoredEntity | undefined; byRow: Map<FactRowKey, StoredFact> }>();
      for (const entityId of committedIds) {
        const eKey = `${sKey}:${entityId}`;
        const buf = await this.#entities.getAsync(eKey);
        if (!buf) {
          // An #entitiesByScope entry must always reference a live #entities row; a missing one means the indexes
          // are corrupt, so fail loudly rather than surface a ghost entity or silently hide the corruption.
          throw new Error(`Entity not found for entityKey ${eKey}`);
        }
        result.set(entityId, { entity: StoredEntity.fromBuffer(buf), byRow: await this.#loadCommittedFacts(eKey) });
      }
      for (const entityId of stagedCreatedIds) {
        if (!result.has(entityId)) {
          result.set(entityId, { entity: undefined, byRow: await this.#loadCommittedFacts(`${sKey}:${entityId}`) });
        }
      }
      return result;
    });
    // Layer this job's staged ops over committed state. Each entity's fact set replays exactly as in getEntity;
    // entity-record presence (createEntity activates, terminate deactivates) replays separately, which is equivalent
    // to a single in-order replay because the two are updated independently by each op kind.
    for (const [entityId, e] of entities) {
      this.#replayFactOps(e.byRow, `${sKey}:${entityId}`, jobId);
    }
    for (const op of this.#stagedOps(jobId)) {
      switch (op.kind) {
        case 'createEntity':
          if (scopeKeyOf(op.entity) === sKey) {
            entities.get(op.entity.entityId.toString())!.entity = op.entity;
          }
          break;
        case 'terminate': {
          const e = scopeKeyOf(op.coords) === sKey ? entities.get(op.coords.entityId.toString()) : undefined;
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
      .map(({ entity, byRow }) => ({ entity: entity!, facts: Array.from(byRow.values()) }));
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
          const eKey = entityKeyOf(entity);
          // Re-creating an entity may change or drop its origin block; clear any stale by-block index entry from the
          // record first, so a later prune can neither double-visit this entity (and throw) nor wrongly delete one
          // that has since become non-retractable.
          const priorBuf = await this.#entities.getAsync(eKey);
          if (priorBuf) {
            const prior = StoredEntity.fromBuffer(priorBuf);
            if (prior.originBlock !== undefined) {
              await this.#entitiesByBlock.deleteValue(prior.originBlock.blockNumber, eKey);
            }
          }
          await this.#entities.set(eKey, entity.toBuffer());
          await this.#entitiesByScope.set(scopeKeyOf(entity), entity.entityId.toString());
          if (entity.originBlock !== undefined) {
            await this.#entitiesByBlock.set(entity.originBlock.blockNumber, eKey);
          }
          break;
        }
        case 'record': {
          const fact = op.fact;
          const rowKey = factRowKeyOf(fact);
          // Re-recording a fact may change or drop its origin block; keep its original sequence number (so it keeps
          // its creation position) and clear any stale by-block index entry, mirroring the createEntity guard above.
          const priorBuf = await this.#facts.getAsync(rowKey);
          let seq: number;
          if (priorBuf) {
            const prior = deserializeFactRow(priorBuf);
            seq = prior.seq;
            if (prior.fact.originBlock !== undefined) {
              await this.#factsByBlock.deleteValue(prior.fact.originBlock.blockNumber, rowKey);
            }
          } else {
            seq = await this.#nextFactSeq();
          }
          await this.#facts.set(rowKey, serializeFactRow({ seq, fact }));
          await this.#factsByEntity.set(entityKeyOf(fact), rowKey);
          if (fact.originBlock !== undefined) {
            await this.#factsByBlock.set(fact.originBlock.blockNumber, rowKey);
          }
          break;
        }
        case 'terminate':
          await this.#deleteEntity(op.coords);
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
    const orphanedEntities: EntityKey[] = [];
    for await (const [, eKey] of this.#entitiesByBlock.entriesAsync({ start: toBlock + 1 })) {
      orphanedEntities.push(eKey);
    }
    const deletedEntities = new Set<EntityKey>();
    let removedEntities = 0;
    for (const eKey of orphanedEntities) {
      const buf = await this.#entities.getAsync(eKey);
      if (!buf) {
        // An #entitiesByBlock entry must always reference a live #entities row; a missing one means the indexes are
        // corrupt, so fail loudly rather than leave a ghost entity behind.
        throw new Error(`Entity not found for entityKey ${eKey}`);
      }
      const entity = StoredEntity.fromBuffer(buf);
      await this.#deleteEntity(entity);
      deletedEntities.add(eKey);
      removedEntities++;
    }

    // Pass 2: delete remaining retractable facts originating above toBlock whose entity survived pass 1. Pass 1 already
    // removed the facts_by_block rows of pruned entities, so any leftover row here belongs to a surviving entity.
    const orphanedFacts: { block: BlockNum; rowKey: FactRowKey }[] = [];
    for await (const [block, rowKey] of this.#factsByBlock.entriesAsync({ start: toBlock + 1 })) {
      orphanedFacts.push({ block, rowKey });
    }
    let removedFacts = 0;
    for (const { block, rowKey } of orphanedFacts) {
      const buf = await this.#facts.getAsync(rowKey);
      if (!buf) {
        // A still-present by-block entry with no fact row means the indexes are corrupt (pass 1 removes both the row
        // and the by-block entry for pruned entities), so fail loudly rather than leave a dangling index entry.
        throw new Error(`Fact not found for rowKey ${rowKey}`);
      }
      const { fact } = deserializeFactRow(buf);
      const eKey = entityKeyOf(fact);
      // Belt-and-braces: a fact whose entity was pruned in pass 1 must not be re-processed here. With #deleteEntity
      // clearing the by-block index this is unreachable, but the guard keeps pass 2 correct if that ever changes.
      if (deletedEntities.has(eKey)) {
        continue;
      }
      await this.#facts.delete(rowKey);
      await this.#factsByBlock.deleteValue(block, rowKey);
      await this.#factsByEntity.deleteValue(eKey, rowKey);
      removedFacts++;
    }
    this.logger.verbose('rolled back entity store', { removedEntities, removedFacts, toBlock });
  }

  // ---- private helpers ----

  /**
   * Loads the committed facts for an entity keyed by their dedup row key, in creation order. Caller may wrap in a
   * transaction.
   */
  async #loadCommittedFacts(eKey: EntityKey): Promise<Map<FactRowKey, StoredFact>> {
    // Snapshot the index before issuing point reads so we never interleave reads with a live cursor (IndexedDB
    // cursors are sensitive to what runs between iterations).
    const rowKeys: FactRowKey[] = [];
    for await (const rowKey of this.#factsByEntity.getValuesAsync(eKey)) {
      rowKeys.push(rowKey);
    }
    const rows: { rowKey: FactRowKey; seq: number; fact: StoredFact }[] = [];
    for (const rowKey of rowKeys) {
      const buf = await this.#facts.getAsync(rowKey);
      if (!buf) {
        // A #factsByEntity entry must always reference a live #facts row; a missing one means the indexes are
        // corrupt, so fail loudly rather than silently drop the fact.
        throw new Error(`Fact not found for rowKey ${rowKey}`);
      }
      const { seq, fact } = deserializeFactRow(buf);
      rows.push({ rowKey, seq, fact });
    }
    // Multimap value order is backend-dependent (insertion order on IndexedDB, value-sorted on LMDB); sort by the
    // commit-assigned sequence so facts always come back in creation order.
    rows.sort((a, b) => a.seq - b.seq);
    return new Map(rows.map(({ rowKey, fact }) => [rowKey, fact]));
  }

  /**
   * Replays a job's staged ops over a committed fact map for read-your-writes: a record sets (dedups) a fact row, a
   * terminate clears the entity's facts. Order matters so a terminate-then-record sequence resolves to the re-recorded
   * fact. createEntity ops do not affect the fact set.
   */
  #replayFactOps(byRow: Map<FactRowKey, StoredFact>, eKey: EntityKey, jobId: string): void {
    for (const op of this.#stagedOps(jobId)) {
      switch (op.kind) {
        case 'record':
          if (entityKeyOf(op.fact) === eKey) {
            byRow.set(factRowKeyOf(op.fact), op.fact);
          }
          break;
        case 'terminate':
          if (entityKeyOf(op.coords) === eKey) {
            byRow.clear();
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
  async #deleteEntity(coords: EntityCoords): Promise<void> {
    const eKey = entityKeyOf(coords);
    const rowKeys: FactRowKey[] = [];
    for await (const rowKey of this.#factsByEntity.getValuesAsync(eKey)) {
      rowKeys.push(rowKey);
    }
    for (const rowKey of rowKeys) {
      const buf = await this.#facts.getAsync(rowKey);
      if (!buf) {
        // A #factsByEntity entry must always reference a live #facts row; a missing one means the indexes are
        // corrupt, so fail loudly rather than silently skip cleanup.
        throw new Error(`Fact not found for rowKey ${rowKey}`);
      }
      const { fact } = deserializeFactRow(buf);
      await this.#facts.delete(rowKey);
      await this.#factsByEntity.deleteValue(eKey, rowKey);
      if (fact.originBlock !== undefined) {
        await this.#factsByBlock.deleteValue(fact.originBlock.blockNumber, rowKey);
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
    await this.#entitiesByScope.deleteValue(scopeKeyOf(coords), coords.entityId.toString());
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
