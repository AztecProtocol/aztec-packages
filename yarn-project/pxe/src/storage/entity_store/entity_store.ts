import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import {
  type FactAnchor,
  StoredEntity,
  StoredFact,
  entityKey,
  entityKeyOf,
  factRowKeyOf,
  scopeKey,
  scopeKeyOf,
} from './stored_fact.js';

type JobId = string;

/** A pending mutation for a job: create an entity, record a fact, or terminate (delete) an entity. */
type StagedOp =
  | { kind: 'createEntity'; entity: StoredEntity }
  | { kind: 'record'; fact: StoredFact }
  | { kind: 'terminate'; contract: AztecAddress; scope: AztecAddress; entityTypeId: Fr; entityId: Fr };

/**
 * Stores immutable facts about entities, grouped by contract, scope, entity type, and entity id.
 *
 * Append-only within a job commit. Retractable facts (those with a block anchor) are deleted on block prune.
 * Non-retractable facts (anchor === undefined) survive reorgs as external inputs. Writes are staged per-job and
 * flushed atomically on commit.
 */
export class EntityStore implements StagedStore {
  readonly storeName: string = 'entity';

  #store: AztecAsyncKVStore;
  /** Primary entity records, keyed by entityKey; holds the entity payload and optional anchor. */
  #entities: AztecAsyncMap<string, Buffer>;
  /** Index from blockNumber to entityKey, for delete-on-prune of retractable entities (anchored entities only). */
  #entitiesByBlock: AztecAsyncMultiMap<number, string>;
  /** Primary fact records, keyed by factRowKey (deduplication row key). */
  #facts: AztecAsyncMap<string, Buffer>;
  /** Index from entityKey to factRowKey for efficient entity-level fold. */
  #factsByEntity: AztecAsyncMultiMap<string, string>;
  /** Index from scopeKey to entityId string for active-entity enumeration. */
  #entitiesByScope: AztecAsyncMultiMap<string, string>;
  /** Index from blockNumber to factRowKey, for delete-on-prune (retractable facts only). */
  #factsByBlock: AztecAsyncMultiMap<number, string>;

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
    this.#opsForJob = new Map();
    this.#jobLocks = new Map();
  }

  /**
   * Stages an entity record (with its own payload and optional anchor) under the given job. `anchor === undefined`
   * marks the entity non-retractable (it survives reorgs; only its own retractable facts are pruned); a defined
   * anchor marks the whole entity retractable — on a prune above its block, the entity and all its facts are deleted.
   * The entity becomes active once committed, independently of whether it owns any facts.
   */
  createEntity(
    contract: AztecAddress,
    scope: AztecAddress,
    entityTypeId: Fr,
    entityId: Fr,
    payload: Fr[],
    anchor: FactAnchor | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      const entity = new StoredEntity(contract, scope, entityTypeId, entityId, payload, anchor);
      this.#opsFor(jobId).push({ kind: 'createEntity', entity });
      return Promise.resolve();
    });
  }

  /**
   * Stages a fact for recording under the given job. `anchor === undefined` marks the fact non-retractable (it
   * survives reorgs); a defined anchor ties the fact to a specific block and it will be deleted on prune.
   * Idempotent: duplicate (entity, factType, payload) tuples collapse to a single row via the dedup row key.
   */
  recordFact(
    contract: AztecAddress,
    scope: AztecAddress,
    entityTypeId: Fr,
    entityId: Fr,
    factTypeId: Fr,
    payload: Fr[],
    anchor: FactAnchor | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      const fact = new StoredFact(contract, scope, entityTypeId, entityId, factTypeId, payload, anchor);
      this.#opsFor(jobId).push({ kind: 'record', fact });
      return Promise.resolve();
    });
  }

  /** Permanently delete an entity (all its facts). Staged within the job; applied on commit. */
  terminateEntity(
    contract: AztecAddress,
    scope: AztecAddress,
    entityTypeId: Fr,
    entityId: Fr,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#opsFor(jobId).push({ kind: 'terminate', contract, scope, entityTypeId, entityId });
      return Promise.resolve();
    });
  }

  /**
   * Returns the facts for one entity.
   *
   * @param contract - The contract address owning the entity.
   * @param scope - The scope (recipient address) under which facts were recorded.
   * @param entityTypeId - Discriminates entity kinds within a contract+scope.
   * @param entityId - Identifies the specific entity instance.
   * @param jobId - The job whose staged writes are layered over committed state.
   */
  async getEntityFacts(
    contract: AztecAddress,
    scope: AztecAddress,
    entityTypeId: Fr,
    entityId: Fr,
    jobId: string,
  ): Promise<StoredFact[]> {
    const eKey = entityKey(contract, scope, entityTypeId, entityId);
    const byRow = await this.#store.transactionAsync(() => this.#loadCommittedFacts(eKey));
    this.#replayFactOps(byRow, eKey, jobId);
    return Array.from(byRow.values());
  }

  /**
   * Returns one entity's payload together with its facts.
   *
   * The payload comes from the entity record (empty when no entity record exists); the facts come from the per-entity
   * fact index. This job's staged ops are layered over committed state for read-your-writes: a createEntity sets the
   * payload, a record adds/dedups a fact, a terminate clears both payload and facts.
   *
   * @param contract - The contract address owning the entity.
   * @param scope - The scope (recipient address) under which the entity was created.
   * @param entityTypeId - Discriminates entity kinds within a contract+scope.
   * @param entityId - Identifies the specific entity instance.
   * @param jobId - The job whose staged writes are layered over committed state.
   */
  async getEntity(
    contract: AztecAddress,
    scope: AztecAddress,
    entityTypeId: Fr,
    entityId: Fr,
    jobId: string,
  ): Promise<{ payload: Fr[]; facts: StoredFact[] }> {
    const eKey = entityKey(contract, scope, entityTypeId, entityId);
    const { payload, byRow } = await this.#store.transactionAsync(async () => {
      const entityBuf = await this.#entities.getAsync(eKey);
      return {
        payload: entityBuf ? StoredEntity.fromBuffer(entityBuf).payload : [],
        byRow: await this.#loadCommittedFacts(eKey),
      };
    });
    // Replay this job's staged ops in order over committed state. Order matters so a terminate-then-create sequence
    // resolves to the re-created entity, and a terminate clears both payload and facts.
    let currentPayload = payload;
    for (const op of this.#stagedOps(jobId)) {
      if (op.kind === 'createEntity') {
        if (entityKeyOf(op.entity) === eKey) {
          currentPayload = op.entity.payload;
        }
      } else if (op.kind === 'record') {
        if (entityKeyOf(op.fact) === eKey) {
          byRow.set(factRowKeyOf(op.fact), op.fact);
        }
      } else if (entityKey(op.contract, op.scope, op.entityTypeId, op.entityId) === eKey) {
        currentPayload = [];
        byRow.clear();
      }
    }
    return { payload: currentPayload, facts: Array.from(byRow.values()) };
  }

  /**
   * Returns the entity ids of all active entities under (contract, scope, entityTypeId) — entities that have an
   * entity record and have not been terminated. Entity presence is independent of whether the entity owns any facts.
   */
  async activeEntities(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr, jobId: string): Promise<Fr[]> {
    const sKey = scopeKey(contract, scope, entityTypeId);
    const active = await this.#store.transactionAsync(async () => {
      const seen = new Set<string>();
      const result = new Set<string>();
      for await (const entityId of this.#entitiesByScope.getValuesAsync(sKey)) {
        if (seen.has(entityId)) {
          continue;
        }
        seen.add(entityId);
        // Guard against stale index entries: once terminate/rollback delete an entity record, its entity id
        // should be gone from #entitiesByScope, but we re-check the entity record exists so a missed index update
        // can never surface a ghost entity as active.
        if (await this.#entities.getAsync(`${sKey}:${entityId}`)) {
          result.add(entityId);
        }
      }
      return result;
    });
    // Replay this job's staged ops in order: a createEntity activates the entity, a terminate deactivates it.
    for (const op of this.#stagedOps(jobId)) {
      if (op.kind === 'createEntity') {
        if (scopeKeyOf(op.entity) === sKey) {
          active.add(op.entity.entityId.toString());
        }
      } else if (op.kind === 'terminate' && scopeKey(op.contract, op.scope, op.entityTypeId) === sKey) {
        active.delete(op.entityId.toString());
      }
    }
    return Array.from(active, Fr.fromString);
  }

  /**
   * Commits all staged operations for the given job to persistent storage.
   *
   * Must be called inside a transaction owned by the caller (JobCoordinator wraps all commits in a single
   * transactionAsync, and IndexedDB does not support nested transactions). Do not call #withJobLock here — awaiting
   * the lock creates a microtask boundary that causes IndexedDB to auto-commit the outer transaction.
   */
  async commit(jobId: string): Promise<void> {
    for (const op of this.#opsFor(jobId)) {
      if (op.kind === 'createEntity') {
        const entity = op.entity;
        const eKey = entityKeyOf(entity);
        // Re-creating an entity may change or drop its anchor; clear any stale by-block index entry from the prior
        // record first, so a later prune can neither double-visit this entity (and throw) nor wrongly delete one that
        // has since become non-retractable.
        const priorBuf = await this.#entities.getAsync(eKey);
        if (priorBuf) {
          const prior = StoredEntity.fromBuffer(priorBuf);
          if (prior.anchor !== undefined) {
            await this.#entitiesByBlock.deleteValue(prior.anchor.blockNumber, eKey);
          }
        }
        await this.#entities.set(eKey, entity.toBuffer());
        await this.#entitiesByScope.set(scopeKeyOf(entity), entity.entityId.toString());
        if (entity.anchor !== undefined) {
          await this.#entitiesByBlock.set(entity.anchor.blockNumber, eKey);
        }
      } else if (op.kind === 'record') {
        const fact = op.fact;
        const rowKey = factRowKeyOf(fact);
        await this.#facts.set(rowKey, fact.toBuffer());
        await this.#factsByEntity.set(entityKeyOf(fact), rowKey);
        if (fact.anchor !== undefined) {
          await this.#factsByBlock.set(fact.anchor.blockNumber, rowKey);
        }
      } else {
        await this.#deleteEntity(op.contract, op.scope, op.entityTypeId, op.entityId);
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
   * Delete-on-prune in two passes. Pass 1 deletes every retractable entity anchored to a block strictly above
   * `toBlock` wholesale — its payload and every fact it owns, regardless of each fact's own flag. Pass 2 deletes any
   * remaining retractable fact anchored above `toBlock` whose entity survived pass 1. Non-retractable entities and
   * facts are untouched (they never enter the by-block indexes). Must run inside a caller-owned transaction (the
   * reorg path wraps it with the sibling stores' rollbacks; IndexedDB has no nested transactions). Throws if any job
   * has uncommitted staged writes, since rolling back mid-job could re-introduce records anchored to deleted blocks.
   */
  async rollback(toBlock: number): Promise<void> {
    if (this.#opsForJob.size > 0) {
      throw new Error('PXE entity store rollback is not allowed while jobs are running');
    }

    // Pass 1: delete retractable entities anchored above toBlock wholesale. Snapshot before mutating so we never
    // delete from the multimap we are iterating.
    const orphanedEntities: string[] = [];
    for await (const [, eKey] of this.#entitiesByBlock.entriesAsync({ start: toBlock + 1 })) {
      orphanedEntities.push(eKey);
    }
    const deletedEntities = new Set<string>();
    let removedEntities = 0;
    for (const eKey of orphanedEntities) {
      const buf = await this.#entities.getAsync(eKey);
      if (!buf) {
        // An #entitiesByBlock entry must always reference a live #entities row; a missing one means the indexes are
        // corrupt, so fail loudly rather than leave a ghost entity behind.
        throw new Error(`Entity not found for entityKey ${eKey}`);
      }
      const entity = StoredEntity.fromBuffer(buf);
      await this.#deleteEntity(entity.contractAddress, entity.scope, entity.entityTypeId, entity.entityId);
      deletedEntities.add(eKey);
      removedEntities++;
    }

    // Pass 2: delete remaining retractable facts anchored above toBlock whose entity survived pass 1. Pass 1 already
    // removed the facts_by_block rows of pruned entities, so any leftover row here belongs to a surviving entity.
    const orphanedFacts: { block: number; rowKey: string }[] = [];
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
      const fact = StoredFact.fromBuffer(buf);
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

  /** Loads the committed facts for an entity keyed by their dedup row key. Caller may wrap in a transaction. */
  async #loadCommittedFacts(eKey: string): Promise<Map<string, StoredFact>> {
    const rows = new Map<string, StoredFact>();
    for await (const rowKey of this.#factsByEntity.getValuesAsync(eKey)) {
      const buf = await this.#facts.getAsync(rowKey);
      if (buf) {
        rows.set(rowKey, StoredFact.fromBuffer(buf));
      }
    }
    return rows;
  }

  /**
   * Replays a job's staged ops over a committed fact map for read-your-writes: a record sets (dedups) a fact row, a
   * terminate clears the entity's facts. Order matters so a terminate-then-record sequence resolves to the re-recorded
   * fact. createEntity ops do not affect the fact set.
   */
  #replayFactOps(byRow: Map<string, StoredFact>, eKey: string, jobId: string): void {
    for (const op of this.#stagedOps(jobId)) {
      if (op.kind === 'record') {
        if (entityKeyOf(op.fact) === eKey) {
          byRow.set(factRowKeyOf(op.fact), op.fact);
        }
      } else if (op.kind === 'terminate' && entityKey(op.contract, op.scope, op.entityTypeId, op.entityId) === eKey) {
        byRow.clear();
      }
    }
  }

  /**
   * Deletes an entity wholesale from every index: its record, all its facts, and the scope/block index entries.
   * Called during commit for 'terminate' ops and during pass 1 of rollback for pruned retractable entities.
   */
  async #deleteEntity(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr, entityId: Fr): Promise<void> {
    const eKey = entityKey(contract, scope, entityTypeId, entityId);
    const rowKeys: string[] = [];
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
      const fact = StoredFact.fromBuffer(buf);
      await this.#facts.delete(rowKey);
      await this.#factsByEntity.deleteValue(eKey, rowKey);
      if (fact.anchor !== undefined) {
        await this.#factsByBlock.deleteValue(fact.anchor.blockNumber, rowKey);
      }
    }
    const entityBuf = await this.#entities.getAsync(eKey);
    if (entityBuf) {
      const entity = StoredEntity.fromBuffer(entityBuf);
      await this.#entities.delete(eKey);
      if (entity.anchor !== undefined) {
        await this.#entitiesByBlock.deleteValue(entity.anchor.blockNumber, eKey);
      }
    }
    await this.#entitiesByScope.deleteValue(scopeKey(contract, scope, entityTypeId), entityId.toString());
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
