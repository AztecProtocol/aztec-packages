import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { type FactAnchor, StoredFact, entityKeyOf, factRowKeyOf, scopeKeyOf } from './stored_fact.js';

type JobId = string;

/** A pending mutation for a job: either record a fact, or terminate (delete) an entity. */
type StagedOp =
  | { kind: 'record'; fact: StoredFact }
  | { kind: 'terminate'; contract: AztecAddress; scope: AztecAddress; entityTypeId: Fr; correlationKey: Fr };

/**
 * Stores immutable facts about entities, grouped by contract, scope, entity type, and correlation key.
 *
 * Append-only within a job commit. Retractable facts (those with a block anchor) are deleted on block prune.
 * Non-retractable facts (anchor === undefined) survive reorgs as external inputs. Writes are staged per-job and
 * flushed atomically on commit.
 */
export class FactStore implements StagedStore {
  readonly storeName: string = 'fact';

  #store: AztecAsyncKVStore;
  /** Primary fact records, keyed by factRowKey (deduplication row key). */
  #facts: AztecAsyncMap<string, Buffer>;
  /** Index from entityKey to factRowKey for efficient entity-level fold. */
  #factsByEntity: AztecAsyncMultiMap<string, string>;
  /** Index from scopeKey to correlationKey string for active-entity enumeration. */
  #entitiesByScope: AztecAsyncMultiMap<string, string>;
  /** Index from blockNumber to factRowKey, for delete-on-prune (retractable facts only). */
  #factsByBlock: AztecAsyncMultiMap<number, string>;

  #opsForJob: Map<JobId, StagedOp[]>;
  #jobLocks: Map<JobId, Semaphore>;

  logger = createLogger('fact_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#facts = store.openMap('facts');
    this.#factsByEntity = store.openMultiMap('facts_by_entity');
    this.#entitiesByScope = store.openMultiMap('entities_by_scope');
    this.#factsByBlock = store.openMultiMap('facts_by_block');
    this.#opsForJob = new Map();
    this.#jobLocks = new Map();
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
    correlationKey: Fr,
    factTypeId: Fr,
    payload: Fr[],
    anchor: FactAnchor | undefined,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      const fact = new StoredFact(contract, scope, entityTypeId, correlationKey, factTypeId, payload, anchor);
      this.#opsFor(jobId).push({ kind: 'record', fact });
      return Promise.resolve();
    });
  }

  /**
   * Returns all committed facts for one entity, for use in Noir fold execution.
   * @param contract - The contract address owning the entity.
   * @param scope - The scope (recipient address) under which facts were recorded.
   * @param entityTypeId - Discriminates entity kinds within a contract+scope.
   * @param correlationKey - Identifies the specific entity instance.
   */
  async getEntityFacts(
    contract: AztecAddress,
    scope: AztecAddress,
    entityTypeId: Fr,
    correlationKey: Fr,
  ): Promise<StoredFact[]> {
    return this.#store.transactionAsync(async () => {
      const entityKey = `${contract}:${scope}:${entityTypeId}:${correlationKey}`;
      const facts: StoredFact[] = [];
      for await (const rowKey of this.#factsByEntity.getValuesAsync(entityKey)) {
        const buf = await this.#facts.getAsync(rowKey);
        if (buf) {
          facts.push(StoredFact.fromBuffer(buf));
        }
      }
      return facts;
    });
  }

  /**
   * Returns the correlation keys of all active entities under (contract, scope, entityTypeId) — i.e. entities that
   * still have at least one committed fact.
   */
  async activeEntities(contract: AztecAddress, scope: AztecAddress, entityTypeId: Fr): Promise<Fr[]> {
    return this.#store.transactionAsync(async () => {
      const scopeKey = `${contract}:${scope}:${entityTypeId}`;
      const seen = new Set<string>();
      const result: Fr[] = [];
      for await (const correlation of this.#entitiesByScope.getValuesAsync(scopeKey)) {
        if (seen.has(correlation)) {
          continue;
        }
        seen.add(correlation);
        const entityKey = `${scopeKey}:${correlation}`;
        let hasFact = false;
        for await (const _ of this.#factsByEntity.getValuesAsync(entityKey)) {
          hasFact = true;
          break;
        }
        if (hasFact) {
          result.push(Fr.fromString(correlation));
        }
      }
      return result;
    });
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
      if (op.kind === 'record') {
        const fact = op.fact;
        const rowKey = factRowKeyOf(fact);
        await this.#facts.set(rowKey, fact.toBuffer());
        await this.#factsByEntity.set(entityKeyOf(fact), rowKey);
        await this.#entitiesByScope.set(scopeKeyOf(fact), fact.correlationKey.toString());
        if (fact.anchor !== undefined) {
          await this.#factsByBlock.set(fact.anchor.blockNumber, rowKey);
        }
      } else {
        await this.#deleteEntity(op.contract, op.scope, op.entityTypeId, op.correlationKey);
      }
    }
    this.#clearJobData(jobId);
  }

  /** Discards all staged operations for the given job without persisting them. */
  discardStaged(jobId: string): Promise<void> {
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  // ---- private helpers ----

  // TEMPORARY stub — Task 1.3 replaces this with real entity deletion. Never reached by Task 1.2 tests
  // (they stage no 'terminate' ops).
  async #deleteEntity(
    _contract: AztecAddress,
    _scope: AztecAddress,
    _entityTypeId: Fr,
    _correlationKey: Fr,
  ): Promise<void> {
    throw new Error('FactStore.#deleteEntity not implemented yet');
  }

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
