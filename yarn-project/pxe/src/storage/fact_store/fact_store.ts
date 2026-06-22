import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { FactCollectionKey, type FactCollectionTypeKey, type OriginBlock } from './fact_store_keys.js';
import { type Fact, StoredFact, factKeyStrOf } from './stored_fact.js';

type JobId = string;
type BlockNum = number;
type FactBuffer = Buffer;
type FactCollectionTypeKeyStr = string;
type FactCollectionKeyStr = string;
type FactKeyStr = string;
type ScopeStr = string;

/** A fact collection as returned by the store. */
export type FactCollection = { key: FactCollectionKey; facts: Fact[] };

/** A fact together with the set of scopes it is visible under. */
type FactWithScopes = { fact: Fact; scopes: Set<ScopeStr> };

/** Internal auxiliary type assembling a collection. */
type CollectionWithFacts = { key: FactCollectionKey; facts: Map<FactKeyStr, FactWithScopes> };

/** A pending operation for a job: record a fact under a scope, or remove (descope) a collection from a scope. */
type StagedOp =
  | { kind: 'recordFact'; fact: StoredFact; scope: AztecAddress }
  | { kind: 'removeFactCollection'; key: FactCollectionKey; scope: AztecAddress };

/**
 * Stores immutable facts grouped into collections, isolated by contract and scoped per fact.
 *
 * A fact collection is a contract-defined bag of facts identified by a {@link FactCollectionKey} (contract, collection
 * type, and id). A fact is a contract-defined immutable, typed datum in a collection. Collections are implicit: one
 * comes into being when its first fact is recorded and ceases to exist once it has no facts left.
 *
 * What makes this store different to, for example, the `CapsuleStore`, is that it is designed to support use cases
 * where resilience to reorgs is needed, via what we call _retractability_.
 *
 * Facts can be retractable or non-retractable. They are retractable if they are associated to an origin block.
 * Retractable facts are removed from the store when their origin block is pruned (typically due to a reorg).
 * Non-retractable facts survive reorgs; they must then be explicitly deleted, so as not to keep consuming resources
 * (storage and compute) indefinitely.
 *
 * Scoping is per fact. Facts are only visible at scopes they were written to. A scope never sees facts recorded solely
 * under another scope, even within the same collection.
 *
 * This store is designed to enable Aztec.nr to implement complex workflows such as offchain reception or partial note
 * processing by storing structured data that is guaranteed to exist conditionally to specific blocks being included in
 * the chain, while leaving the complexity of ensuring said guarantees to PXE.
 *
 * A key design driver is that PXE knows nothing about the actual fact contents: it just manages enough metadata to
 * provide the guarantees mentioned above. That way, concepts such as offchain delivery or partial notes are completely
 * defined by Aztec.nr, opening the door to further extension without the need for ad-hoc PXE support.
 *
 * As with most other PXE stores, writes are staged per-job and flushed atomically on commit.
 */
export class FactStore implements StagedStore {
  readonly storeName: string = 'fact';

  #store: AztecAsyncKVStore;

  /** Primary index of fact records. */
  #facts: AztecAsyncMap<FactKeyStr, FactBuffer>;

  /** Index for per-collection fact enumeration and by-type collection discovery. */
  #factsByCollection: AztecAsyncMultiMap<FactCollectionKeyStr, FactKeyStr>;

  /** The scope dimension: the set of scopes each fact is visible under. Keyed by fact key, which carries the collection
   * key as a prefix, so a collection's scopes are recoverable via a prefix range scan. */
  #scopesByFact: AztecAsyncMultiMap<FactKeyStr, ScopeStr>;

  /** Index for delete-on-prune of retractable facts (those with an origin block). */
  #factsByBlock: AztecAsyncMultiMap<BlockNum, FactKeyStr>;

  /** Job uncommitted data */
  #opsForJob: Map<JobId, StagedOp[]>;

  /** Per-job locks */
  #jobLocks: Map<JobId, Semaphore>;

  logger = createLogger('fact_store');

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#facts = store.openMap('facts');
    this.#factsByCollection = store.openMultiMap('facts_by_collection');
    this.#scopesByFact = store.openMultiMap('scopes_by_fact');
    this.#factsByBlock = store.openMultiMap('facts_by_block');
    this.#opsForJob = new Map();
    this.#jobLocks = new Map();
  }

  /**
   * Records a fact in a collection, visible under the given scope.
   *
   * The collection is created implicitly on the first fact recorded for its key: recording into an existing collection
   * just adds to it.
   *
   * If `originBlock === undefined`, the fact is non-retractable: it survives reorgs. A defined origin block makes the
   * fact retractable: on a prune below its block, it will be deleted.
   *
   * Idempotent: re-recording an identical fact (same collection, fact type, payload, and origin block) is a no-op.
   * The same payload tied to a different origin block is a distinct fact.
   */
  recordFact(
    factCollectionKey: FactCollectionKey,
    factTypeId: Fr,
    payload: Fr[],
    originBlock: OriginBlock | undefined,
    scope: AztecAddress,
    jobId: string,
  ): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#stagedOpsFor(jobId).push({
        kind: 'recordFact',
        fact: new StoredFact(factCollectionKey, factTypeId, payload, originBlock),
        scope,
      });
      return Promise.resolve();
    });
  }

  /**
   * Removes a fact collection from the given scope: removes that scope from every one of the collection's facts,
   * reaping any fact thereby left with no scope.
   *
   * This is typically done when the collection has finalized for that scope and there's no more work to do, to save
   * disk space and to avoid re-processing it indefinitely. A scope only ever retracts its own view: facts another
   * scope still references survive.
   *
   * Idempotent: descoping a collection (or fact) that is not visible under the given scope is a no-op.
   */
  removeFactCollection(factCollectionKey: FactCollectionKey, scope: AztecAddress, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, () => {
      this.#stagedOpsFor(jobId).push({ kind: 'removeFactCollection', key: factCollectionKey, scope });
      return Promise.resolve();
    });
  }

  /**
   * Returns one fact collection, holding the facts visible under any of the given scopes, or undefined if no fact of
   * the collection is visible under them.
   */
  async getFactCollection(
    factCollectionKey: FactCollectionKey,
    scopes: AztecAddress[],
    jobId: string,
  ): Promise<FactCollection | undefined> {
    const collectionKey = factCollectionKey.toString();
    const committed = await this.#store.transactionAsync(() => this.#readCollectionsFromDb([factCollectionKey]));

    const collection = this.#foldStagedOps(committed, jobId).get(collectionKey);
    if (!collection) {
      return undefined;
    }
    const facts = this.#visibleFacts(collection, scopes);
    return facts.length > 0 ? { key: factCollectionKey, facts } : undefined;
  }

  /**
   * Returns every fact collection of the given type that has at least one fact visible under the given scopes, each
   * holding only its facts visible under them.
   */
  async getFactCollectionsByType(
    factCollectionTypeKey: FactCollectionTypeKey,
    scopes: AztecAddress[],
    jobId: string,
  ): Promise<FactCollection[]> {
    const typeKey = factCollectionTypeKey.toString();
    const committed = await this.#readCollectionsFromDbByType(typeKey);

    return Array.from(this.#foldStagedOps(committed, jobId, typeKey).values())
      .map(collection => ({ key: collection.key, facts: this.#visibleFacts(collection, scopes) }))
      .filter(collection => collection.facts.length > 0);
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
        case 'recordFact':
          await this.#commitFact(op.fact, op.scope);
          break;
        case 'removeFactCollection':
          await this.#descopeCollection(op.key.toString(), op.scope.toString());
          break;
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unhandled FactStore staged op kind: ${JSON.stringify(_exhaustive)}`);
        }
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
   * Removes every retractable fact originating from blocks over height `toBlock`, across all scopes.
   *
   * Non-retractable facts are untouched. Must run inside a caller-owned transaction (because it needs to share the
   * transaction with other stores and IndexedDB has no nested transactions).
   *
   * Throws if any job is in flight (has accessed the store and not yet committed or discarded), since rolling back
   * mid-job could re-introduce records originating from deleted blocks or change state underneath a job's view.
   */
  async rollback(toBlock: BlockNum): Promise<void> {
    if (this.#opsForJob.size > 0) {
      throw new Error('PXE fact store rollback is not allowed while jobs are running');
    }

    const removedFacts = await this.#retractFacts(toBlock);

    this.logger.verbose('rolled back fact store', { removedFacts, toBlock });
  }

  /**
   * Deletes retractable facts originating above `toBlock` (taking their scope entries with them), returning the number
   * of by-block entries scanned. A reorg invalidates a fact for every scope, so this is scope-agnostic.
   *
   * Requires to be run in a transactionAsync context.
   */
  async #retractFacts(toBlock: BlockNum): Promise<number> {
    // Snapshot the orphaned fact keys before mutating so we never delete from the cursor we are iterating, kicking off
    // each fact-body read during the scan so a DB request stays pending across the cursor-to-delete boundary (a drained
    // cursor with no read in flight would let the transaction auto-commit before the deletes).
    const factReads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
    for await (const [, factKey] of this.#factsByBlock.entriesAsync({ start: toBlock + 1 })) {
      factReads.set(factKey, this.#facts.getAsync(factKey));
    }
    await Promise.all(
      Array.from(factReads, async ([factKey, read]) => {
        const buf = await read;
        if (!buf) {
          // The by-block index just yielded this factKey, so a missing primary record means the indexes are out of
          // sync. Log as this should be unreachable unless there is a bug.
          this.logger.warn('Skipping retraction of a fact missing from the primary store: by-block index is stale', {
            factKey,
          });
          return;
        }
        await this.#deleteFact(factKey, StoredFact.fromBuffer(buf));
      }),
    );
    return factReads.size;
  }

  /**
   * Reads the given collections (their facts, each with its scopes) by key into a Map keyed by collection key, skipping
   * keys with no committed facts.
   *
   * Reads are not wrapped in a transaction: the caller owns the transaction boundary.
   */
  async #readCollectionsFromDb(keys: FactCollectionKey[]): Promise<Map<FactCollectionKeyStr, CollectionWithFacts>> {
    const result = new Map<FactCollectionKeyStr, CollectionWithFacts>();
    for (const key of keys) {
      const collection = await this.#loadCommittedCollection(key.toString());
      if (collection) {
        result.set(key.toString(), collection);
      }
    }
    return result;
  }

  /**
   * Reads every committed collection of the given type with its facts and their scopes, in a single pass.
   *
   * Collection keys are `${typeKey}:${collectionId}` and fact keys carry the collection key (hence the type key) as a
   * prefix, so one range scan of each index spans the whole type. Fact-body reads are kicked off during the first scan
   * and stay pending through the second, keeping a DB request live throughout so the transaction never auto-commits
   * mid-read.
   */
  #readCollectionsFromDbByType(typeKey: FactCollectionTypeKeyStr) {
    return this.#store.transactionAsync(async () => {
      const factReadsByCollection = new Map<FactCollectionKeyStr, Map<FactKeyStr, Promise<FactBuffer | undefined>>>();
      for await (const [collectionKey, factKey] of this.#factsByCollection.entriesAsync({
        start: `${typeKey}:`,
        end: `${typeKey};`,
      })) {
        let reads = factReadsByCollection.get(collectionKey);
        if (!reads) {
          reads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
          factReadsByCollection.set(collectionKey, reads);
        }
        reads.set(factKey, this.#facts.getAsync(factKey));
      }

      // The fact point-reads are now in flight; drain every scope of the type in one range scan while they remain
      // pending. Then await the (already issued) reads to assemble — no further DB requests are issued.
      const scopesByFactKey = await this.#readScopesByFactKey(typeKey);

      const result = new Map<FactCollectionKeyStr, CollectionWithFacts>();
      for (const [collectionKey, reads] of factReadsByCollection) {
        result.set(collectionKey, await this.#assembleCollection(reads, scopesByFactKey));
      }
      return result;
    });
  }

  /**
   * Loads a committed collection or undefined if it has no committed facts.
   *
   * Caller must wrap in a transaction.
   */
  async #loadCommittedCollection(collectionKey: FactCollectionKeyStr): Promise<CollectionWithFacts | undefined> {
    // Kick off each fact read while iterating the index so a DB request is always pending. Draining the cursor and only
    // then reading the facts one `await` at a time would let the IndexedDB transaction auto-commit at the boundary
    // (IndexedDB auto-commits once control returns to the event loop with no pending request), throwing mid-read on the
    // browser backend.
    const factReads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
    for await (const factKey of this.#factsByCollection.getValuesAsync(collectionKey)) {
      factReads.set(factKey, this.#facts.getAsync(factKey));
    }
    if (factReads.size === 0) {
      return undefined;
    }

    // The fact point-reads are now in flight; drain every scope of the collection in one prefix range scan (fact keys
    // carry the collection key as a prefix) while those reads remain pending, keeping a DB request live throughout.
    const scopesByFactKey = await this.#readScopesByFactKey(collectionKey);

    return this.#assembleCollection(factReads, scopesByFactKey);
  }

  /**
   * Drains the scope index for a fact-key prefix (a collection key, or a type key to span every collection of a type)
   * into a map of fact key to scope set, in a single range scan.
   *
   * Caller must wrap in a transaction.
   */
  async #readScopesByFactKey(factKeyPrefix: string): Promise<Map<FactKeyStr, Set<ScopeStr>>> {
    const scopesByFactKey = new Map<FactKeyStr, Set<ScopeStr>>();
    for await (const [factKey, scope] of this.#scopesByFact.entriesAsync({
      start: `${factKeyPrefix}:`,
      end: `${factKeyPrefix};`,
    })) {
      let scopes = scopesByFactKey.get(factKey);
      if (!scopes) {
        scopes = new Set<ScopeStr>();
        scopesByFactKey.set(factKey, scopes);
      }
      scopes.add(scope);
    }
    return scopesByFactKey;
  }

  /**
   * Awaits a collection's in-flight fact-body reads and assembles them with their scopes into a {@link
   * CollectionWithFacts}. The collection key is recovered from a stored fact, so no key-string parsing is needed.
   *
   * `reads` must already be issued (pending) so awaiting them keeps the transaction alive; this method issues no new DB
   * requests.
   */
  async #assembleCollection(
    reads: Map<FactKeyStr, Promise<FactBuffer | undefined>>,
    scopesByFactKey: Map<FactKeyStr, Set<ScopeStr>>,
  ): Promise<CollectionWithFacts> {
    const factKeys = [...reads.keys()];
    const bufs = await Promise.all(reads.values());

    // Await-free tail: deserialize. No DB ops from here on.
    let key: FactCollectionKey | undefined;
    const facts = new Map<FactKeyStr, FactWithScopes>();
    for (let i = 0; i < factKeys.length; i++) {
      const factKey = factKeys[i];
      const buf = bufs[i];
      if (!buf) {
        // Defensive: a #factsByCollection entry must always reference a live #facts entry. A missing one means the
        // indexes are corrupt.
        throw new Error(`Fact not found for factKey ${factKey}`);
      }
      const stored = StoredFact.fromBuffer(buf);
      key ??= stored.factCollectionKey;
      facts.set(factKey, { fact: stored.toFact(), scopes: scopesByFactKey.get(factKey) ?? new Set<ScopeStr>() });
    }
    return { key: key!, facts };
  }

  /** The facts of the collection visible under any of the given scopes. */
  #visibleFacts(collection: CollectionWithFacts, queryScopes: AztecAddress[]): Fact[] {
    const queried = new Set<ScopeStr>(queryScopes.map(scope => scope.toString()));
    return Array.from(collection.facts.values(), ({ fact, scopes }) =>
      [...scopes].some(scope => queried.has(scope)) ? fact : undefined,
    ).filter((fact): fact is Fact => fact !== undefined);
  }

  /**
   * Assembles the current view of a collection of collections together with their facts and per-fact scopes, combining
   * the committed with staged data.
   *
   * When `typeKey` is given, staged records of other types are ignored, so the result holds only that type.
   */
  #foldStagedOps(
    committed: Map<FactCollectionKeyStr, CollectionWithFacts>,
    jobId: string,
    typeKey?: FactCollectionTypeKeyStr,
  ): Map<FactCollectionKeyStr, CollectionWithFacts> {
    const result = new Map<FactCollectionKeyStr, CollectionWithFacts>();

    // Copy to avoid mutating contents of `committed` (including each fact's scope set)
    for (const [collectionKey, { key, facts }] of committed) {
      const copied = new Map<FactKeyStr, FactWithScopes>();
      for (const [factKey, { fact, scopes }] of facts) {
        copied.set(factKey, { fact, scopes: new Set(scopes) });
      }
      result.set(collectionKey, { key, facts: copied });
    }
    for (const op of this.#stagedOpsFor(jobId)) {
      switch (op.kind) {
        case 'recordFact': {
          const key = op.fact.factCollectionKey;
          if (typeKey !== undefined && key.factCollectionTypeKey().toString() !== typeKey) {
            break;
          }
          const collectionKey = key.toString();
          let collection = result.get(collectionKey);
          if (!collection) {
            collection = { key, facts: new Map<FactKeyStr, FactWithScopes>() };
            result.set(collectionKey, collection);
          }
          // Fact dedup is scope-free: re-recording the same fact under a new scope keeps one fact and unions the scope.
          const fKey = factKeyStrOf(op.fact);
          let factWithScopes = collection.facts.get(fKey);
          if (!factWithScopes) {
            factWithScopes = { fact: op.fact.toFact(), scopes: new Set<ScopeStr>() };
            collection.facts.set(fKey, factWithScopes);
          }
          factWithScopes.scopes.add(op.scope.toString());
          break;
        }
        case 'removeFactCollection': {
          // Descope: drop the scope from each of the collection's facts, reaping facts left with no scope.
          const collection = result.get(op.key.toString());
          if (collection) {
            const scopeStr = op.scope.toString();
            for (const [factKey, { scopes }] of collection.facts) {
              scopes.delete(scopeStr);
              if (scopes.size === 0) {
                collection.facts.delete(factKey);
              }
            }
            if (collection.facts.size === 0) {
              result.delete(op.key.toString());
            }
          }
          break;
        }
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unhandled FactStore staged op kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
    return result;
  }

  /**
   * Writes a fact to persistent storage and adds its scope to that fact's scope set.
   *
   * First-write-wins on the fact body: if an identical fact already exists (same scope-free identity) it is left
   * untouched, so the same fact recorded under several scopes is stored once. The scope is added regardless (the
   * multimap dedups identical entries), so the new scope joins the fact's set.
   */
  async #commitFact(fact: StoredFact, scope: AztecAddress): Promise<void> {
    const factKey = factKeyStrOf(fact);
    if (await this.#facts.hasAsync(factKey)) {
      this.logger.debug(`Ignoring already recorded fact`, { factKey });
    } else {
      await this.#facts.set(factKey, fact.toBuffer());
      await this.#factsByCollection.set(fact.factCollectionKey.toString(), factKey);
      if (fact.originBlock !== undefined) {
        await this.#factsByBlock.set(fact.originBlock.blockNumber, factKey);
      }
    }
    await this.#scopesByFact.set(factKey, scope.toString());
  }

  /**
   * Removes `scope` from every fact in the collection, reaping any fact thereby left with no scope.
   *
   * Caller must wrap in a transaction.
   */
  async #descopeCollection(collectionKey: FactCollectionKeyStr, scope: ScopeStr): Promise<void> {
    // Snapshot the fact index before mutating so we never delete from the cursor we are iterating, kicking off each
    // fact-body read during the scan so a DB request stays pending across the cursor-to-mutation boundary (a drained
    // cursor with no read in flight would let the transaction auto-commit before the descope writes).
    const factReads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
    for await (const factKey of this.#factsByCollection.getValuesAsync(collectionKey)) {
      factReads.set(factKey, this.#facts.getAsync(factKey));
    }
    await Promise.all(
      Array.from(factReads, async ([factKey, read]) => {
        const buf = await read;
        await this.#scopesByFact.deleteValue(factKey, scope);
        if ((await this.#scopesByFact.getValueCountAsync(factKey)) > 0) {
          return;
        }
        if (!buf) {
          // A #factsByCollection entry must always reference a live #facts entry, a missing one means the indexes are
          // corrupt.
          throw new Error(`Fact not found for factKey ${factKey}`);
        }
        await this.#deleteFact(factKey, StoredFact.fromBuffer(buf));
      }),
    );
  }

  /**
   * Deletes a fact from the primary store and all its indexes (`#factsByCollection`, `#scopesByFact`, plus
   * `#factsByBlock` if retractable).
   *
   * Caller must wrap in a transaction.
   */
  async #deleteFact(factKey: FactKeyStr, fact: StoredFact): Promise<void> {
    await this.#facts.delete(factKey);
    await this.#factsByCollection.deleteValue(fact.factCollectionKey.toString(), factKey);
    await this.#scopesByFact.delete(factKey);
    if (fact.originBlock !== undefined) {
      await this.#factsByBlock.deleteValue(fact.originBlock.blockNumber, factKey);
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
