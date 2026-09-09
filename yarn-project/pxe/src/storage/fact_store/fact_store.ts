import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { allToCompletion } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';

import { BaseStagingStore, type ReadonlyDb } from '../base_staging_store.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';
import { FactCollectionKey, type FactCollectionTypeKey, type OriginBlock } from './fact_store_keys.js';
import { type Fact, StoredFact, factKeyStrOf } from './stored_fact.js';

type BlockNum = number;
type FactBuffer = Buffer;
type FactCollectionTypeKeyStr = string;
type FactCollectionKeyStr = string;
type FactKeyStr = string;

/** A fact collection as returned by the store. */
export type FactCollection = { key: FactCollectionKey; facts: Fact[] };

/** Internal auxiliary type assembling a collection. */
type CollectionWithFacts = { key: FactCollectionKey; facts: Map<FactKeyStr, Fact> };

/** A pending operation for a change set: record a fact, or delete a fact collection. */
type StagedOp = { kind: 'recordFact'; fact: StoredFact } | { kind: 'deleteFactCollection'; key: FactCollectionKey };

/**
 * Stores immutable facts grouped into collections, isolated by contract and scope.
 *
 * A fact collection is a contract-defined bag of facts identified by a {@link FactCollectionKey} (contract, scope,
 * collection type, and id). A fact is a contract-defined immutable, typed datum in a collection. Collections are
 * implicit: one comes into being when its first fact is recorded and ceases to exist once it has no facts left.
 *
 * What makes this store different to, for example, the `CapsuleStore`, is that it is designed to support use cases
 * where resilience to reorgs is needed, via what we call _retractability_.
 *
 * Facts can be retractable or non-retractable. They are retractable if they are associated to an origin block.
 * Retractable facts are removed from the store when their origin block is pruned (typically due to a reorg).
 * Non-retractable facts survive reorgs: they must then be explicitly deleted, so as not to keep consuming resources
 * (storage and compute) indefinitely.
 *
 * Fact collections are isolated by scope.
 *
 * This store is designed to enable Aztec.nr to implement complex workflows such as offchain reception or partial note
 * processing by storing structured data that is guaranteed to exist conditionally to specific blocks being included in
 * the chain, while leaving the complexity of ensuring said guarantees to PXE.
 *
 * A key design driver is that PXE knows nothing about the actual fact contents: it just manages enough metadata to
 * provide the guarantees mentioned above. That way, concepts such as offchain delivery or partial notes are completely
 * defined by Aztec.nr, opening the door to further extension without the need for ad-hoc PXE support.
 *
 * As with most other PXE stores, writes are staged per change set ID and flushed atomically on commit.
 */
export class FactStore extends BaseStagingStore<FactStoreChangeSet, FactStoreDb> {
  logger = createLogger('fact_store');

  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'fact',
      store,
      buildChangeSet: () => [],
      buildDb: db => ({
        facts: db.openMap('facts'),
        factsByCollection: db.openMultiMap('facts_by_collection'),
        factsByBlock: db.openMultiMap('facts_by_block'),
      }),
    });
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
    changeSetId: ChangeSetId,
  ): Promise<void> {
    return this.withChangeSet(changeSetId, changeSet => {
      changeSet.push({
        kind: 'recordFact',
        fact: new StoredFact(factCollectionKey, factTypeId, payload, originBlock),
      });
    });
  }

  /**
   * Deletes a fact collection: removes every fact under the (scope-qualified) collection key.
   *
   * Idempotent: deleting a collection that does not exist is a no-op.
   */
  deleteFactCollection(factCollectionKey: FactCollectionKey, changeSetId: ChangeSetId): Promise<void> {
    return this.withChangeSet(changeSetId, changeSet => {
      changeSet.push({ kind: 'deleteFactCollection', key: factCollectionKey });
    });
  }

  /**
   * Returns the fact collection for the (scope-qualified) key, or undefined if it has no facts.
   */
  getFactCollection(
    factCollectionKey: FactCollectionKey,
    changeSetId: ChangeSetId,
  ): Promise<FactCollection | undefined> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const collectionKey = factCollectionKey.toString();
      const committedCollection = await this.#loadCommittedCollection(db, factCollectionKey);
      const committed = new Map(committedCollection ? [[collectionKey, committedCollection]] : []);

      const collection = this.#foldStagedOps(committed, changeSet).get(collectionKey);
      if (!collection) {
        return undefined;
      }
      const facts = [...collection.facts.values()];
      return facts.length > 0 ? { key: factCollectionKey, facts } : undefined;
    });
  }

  /**
   * Returns every fact collection of the given type for the queried scope, each holding its facts.
   */
  getFactCollectionsByType(
    factCollectionTypeKey: FactCollectionTypeKey,
    changeSetId: ChangeSetId,
  ): Promise<FactCollection[]> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const typeKey = factCollectionTypeKey.toString();
      const committed = await this.#readCollectionsFromDbByType(db, typeKey);

      return Array.from(this.#foldStagedOps(committed, changeSet, typeKey).values())
        .map(collection => ({ key: collection.key, facts: [...collection.facts.values()] }))
        .filter(collection => collection.facts.length > 0);
    });
  }

  protected async flushChangeSet(changeSet: FactStoreChangeSet, db: FactStoreDb): Promise<void> {
    for (const op of changeSet) {
      switch (op.kind) {
        case 'recordFact':
          await this.#commitFact(db, op.fact);
          break;
        case 'deleteFactCollection':
          await this.#deleteCollection(db, op.key.toString());
          break;
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unhandled FactStore staged op kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
  }

  /**
   * Removes every retractable fact originating from blocks over height `toBlock`, across all scopes.
   *
   * Non-retractable facts are untouched.
   */
  protected async applyRollback(toBlock: BlockNum, db: FactStoreDb): Promise<void> {
    const removedFacts = await this.#retractFacts(db, toBlock);

    this.logger.verbose('rolled back fact store', { removedFacts, toBlock });
  }

  /**
   * Deletes retractable facts originating above `toBlock`, returning the number of by-block entries scanned.
   * Retraction is scope-agnostic: a reorg invalidates a fact regardless of which scope's collection it belongs to.
   *
   * Requires to be run in a transactionAsync context.
   */
  async #retractFacts(db: FactStoreDb, toBlock: BlockNum): Promise<number> {
    // Snapshot the orphaned fact keys before mutating so we never delete from the cursor we are iterating, kicking off
    // each fact-body read during the scan so a DB request stays pending across the cursor-to-delete boundary (a drained
    // cursor with no read in flight would let the transaction auto-commit before the deletes).
    const factReads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
    for await (const [, factKey] of db.factsByBlock.entriesAsync({ start: toBlock + 1 })) {
      factReads.set(factKey, db.facts.getAsync(factKey));
    }
    await allToCompletion(
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
        await this.#deleteFact(db, factKey, StoredFact.fromBuffer(buf));
      }),
    );
    return factReads.size;
  }

  async #readCollectionsFromDbByType(
    db: ReadonlyDb<FactStoreDb>,
    typeKey: FactCollectionTypeKeyStr,
  ): Promise<Map<FactCollectionKeyStr, CollectionWithFacts>> {
    const factReadsByCollection = new Map<FactCollectionKeyStr, Map<FactKeyStr, Promise<FactBuffer | undefined>>>();
    for await (const [collectionKey, factKey] of db.factsByCollection.entriesAsync({
      start: `${typeKey}:`,
      end: `${typeKey};`,
    })) {
      let reads = factReadsByCollection.get(collectionKey);
      if (!reads) {
        reads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
        factReadsByCollection.set(collectionKey, reads);
      }
      reads.set(factKey, db.facts.getAsync(factKey));
    }

    const result = new Map<FactCollectionKeyStr, CollectionWithFacts>();
    for (const [collectionKey, reads] of factReadsByCollection) {
      const collection = await this.#assembleCollection(FactCollectionKey.fromString(collectionKey), reads);
      result.set(collectionKey, collection);
    }
    return result;
  }

  async #loadCommittedCollection(
    db: ReadonlyDb<FactStoreDb>,
    collectionKey: FactCollectionKey,
  ): Promise<CollectionWithFacts | undefined> {
    // Kick off each fact read while iterating the index so a DB request is always pending. Draining the cursor and only
    // then reading the facts one `await` at a time would let the IndexedDB transaction auto-commit at the boundary
    // (IndexedDB auto-commits once control returns to the event loop with no pending request), throwing mid-read on the
    // browser backend.
    const factReads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
    for await (const factKey of db.factsByCollection.getValuesAsync(collectionKey.toString())) {
      factReads.set(factKey, db.facts.getAsync(factKey));
    }
    if (factReads.size === 0) {
      return undefined;
    }

    return this.#assembleCollection(collectionKey, factReads);
  }

  /**
   * Assemble a collection's facts from a set of in-flight DB reads.
   */
  async #assembleCollection(
    collectionKey: FactCollectionKey,
    reads: Map<FactKeyStr, Promise<FactBuffer | undefined>>,
  ): Promise<CollectionWithFacts> {
    const factKeys = [...reads.keys()];
    const bufs = await allToCompletion([...reads.values()]);

    // Await-free tail: deserialize. No DB ops from here on.
    const facts = new Map<FactKeyStr, Fact>();
    for (let i = 0; i < factKeys.length; i++) {
      const factKey = factKeys[i];
      const buf = bufs[i];
      if (!buf) {
        // Defensive: a #factsByCollection entry must always reference a live #facts entry. A missing one means the
        // indexes are corrupt.
        throw new Error(`Fact not found for factKey ${factKey}`);
      }
      const stored = StoredFact.fromBuffer(buf);
      if (stored.factCollectionKey.toString() !== collectionKey.toString()) {
        // Defensive: every read fact must belong to the collection being assembled. A mismatch means the indexes are
        // corrupt.
        throw new Error(`Fact ${factKey} does not belong to collection ${collectionKey}`);
      }
      facts.set(factKey, stored.toFact());
    }
    return { key: collectionKey, facts };
  }

  /**
   * Assembles the current view of a collection of collections together with their facts, combining the committed with
   * staged data.
   *
   * When `typeKey` is given, staged records of other types are ignored, so the result holds only that type.
   */
  #foldStagedOps(
    committed: Map<FactCollectionKeyStr, CollectionWithFacts>,
    changeSet: FactStoreChangeSet,
    typeKey?: FactCollectionTypeKeyStr,
  ): Map<FactCollectionKeyStr, CollectionWithFacts> {
    const result = new Map<FactCollectionKeyStr, CollectionWithFacts>();

    // Copy to avoid mutating the contents of `committed`.
    for (const [collectionKey, { key, facts }] of committed) {
      result.set(collectionKey, { key, facts: new Map(facts) });
    }
    for (const op of changeSet) {
      switch (op.kind) {
        case 'recordFact':
          this.#foldRecordFact(result, op, typeKey);
          break;
        case 'deleteFactCollection':
          this.#foldDeleteFactCollection(result, op);
          break;
        default: {
          const _exhaustive: never = op;
          throw new Error(`Unhandled FactStore staged op kind: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
    return result;
  }

  /**
   * Folds a staged `recordFact` op into view.
   *
   * When `typeKey` is given, an op of another type is ignored, keeping the view limited to that type.
   */
  #foldRecordFact(
    result: Map<FactCollectionKeyStr, CollectionWithFacts>,
    op: Extract<StagedOp, { kind: 'recordFact' }>,
    typeKey?: FactCollectionTypeKeyStr,
  ): void {
    const key = op.fact.factCollectionKey;

    // Type filter doesn't match, nothing to do with this fact
    if (typeKey !== undefined && key.factCollectionTypeKey().toString() !== typeKey) {
      return;
    }

    const collectionKey = key.toString();
    let collection = result.get(collectionKey);

    // Collection didn't exist before this point, the created fact brings it into existence
    if (!collection) {
      collection = { key, facts: new Map<FactKeyStr, Fact>() };
      result.set(collectionKey, collection);
    }

    const fKey = factKeyStrOf(op.fact);
    if (!collection.facts.has(fKey)) {
      collection.facts.set(fKey, op.fact.toFact());
    }
  }

  /**
   * Folds a staged `deleteFactCollection` op into the view: the scope-qualified collection is removed outright.
   */
  #foldDeleteFactCollection(
    result: Map<FactCollectionKeyStr, CollectionWithFacts>,
    op: Extract<StagedOp, { kind: 'deleteFactCollection' }>,
  ): void {
    result.delete(op.key.toString());
  }

  /**
   * Writes a fact to persistent storage. Idempotent: an identical fact (same scope-qualified key) is left untouched.
   */
  async #commitFact(db: FactStoreDb, fact: StoredFact): Promise<void> {
    const factKey = factKeyStrOf(fact);
    if (await db.facts.hasAsync(factKey)) {
      this.logger.debug(`Ignoring already recorded fact`, { factKey });
      return;
    }
    await db.facts.set(factKey, fact.toBuffer());
    await db.factsByCollection.set(fact.factCollectionKey.toString(), factKey);
    if (fact.originBlock !== undefined) {
      await db.factsByBlock.set(fact.originBlock.blockNumber, factKey);
    }
  }

  /**
   * Deletes every fact under the (scope-qualified) collection key.
   *
   * Caller must wrap in a transaction.
   */
  async #deleteCollection(db: FactStoreDb, collectionKey: FactCollectionKeyStr): Promise<void> {
    // Snapshot the fact index before mutating so we never delete from the cursor we are iterating, kicking off each
    // fact-body read during the scan so a DB request stays pending across the cursor-to-mutation boundary (a drained
    // cursor with no read in flight would let the transaction auto-commit before the deletes).
    const factReads = new Map<FactKeyStr, Promise<FactBuffer | undefined>>();
    for await (const factKey of db.factsByCollection.getValuesAsync(collectionKey)) {
      factReads.set(factKey, db.facts.getAsync(factKey));
    }
    await allToCompletion(
      Array.from(factReads, async ([factKey, read]) => {
        const buf = await read;
        if (!buf) {
          // A #factsByCollection entry must always reference a live #facts entry, a missing one means the indexes are
          // corrupt.
          throw new Error(`Fact not found for factKey ${factKey}`);
        }
        await this.#deleteFact(db, factKey, StoredFact.fromBuffer(buf));
      }),
    );
  }

  /**
   * Deletes a fact from the primary store and all its indexes (`factsByCollection`, plus `factsByBlock` if
   * retractable).
   *
   * Caller must wrap in a transaction.
   */
  async #deleteFact(db: FactStoreDb, factKey: FactKeyStr, fact: StoredFact): Promise<void> {
    await db.facts.delete(factKey);
    await db.factsByCollection.deleteValue(fact.factCollectionKey.toString(), factKey);
    if (fact.originBlock !== undefined) {
      await db.factsByBlock.deleteValue(fact.originBlock.blockNumber, factKey);
    }
  }
}

/** A change set's staged data: the ops it has accumulated, replayed over committed state on read and on flush. */
type FactStoreChangeSet = StagedOp[];

type FactStoreDb = {
  /** Primary index of fact records. */
  facts: AztecAsyncMap<FactKeyStr, FactBuffer>;

  /** Index for per-collection fact enumeration and by-type collection discovery. */
  factsByCollection: AztecAsyncMultiMap<FactCollectionKeyStr, FactKeyStr>;

  /** Index for delete-on-prune of retractable facts (those with an origin block). */
  factsByBlock: AztecAsyncMultiMap<BlockNum, FactKeyStr>;
};
