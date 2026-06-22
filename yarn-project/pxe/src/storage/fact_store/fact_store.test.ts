import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactStore } from './fact_store.js';
import { FactCollectionKey, FactCollectionTypeKey } from './fact_store_keys.js';

describe('FactStore', () => {
  let contract: AztecAddress;
  let scope: AztecAddress;
  let scopeB: AztecAddress;
  let factCollectionTypeId: Fr;
  let factTypeA: Fr;
  let factTypeB: Fr;
  let collectionId1: Fr;
  let collectionId2: Fr;
  let collectionKey1: FactCollectionKey;
  let collectionKey2: FactCollectionKey;
  let typeKey: FactCollectionTypeKey;
  const JOB = 'fact-store-test-job';

  let kv: AztecAsyncKVStore;
  let store: FactStore;

  beforeEach(async () => {
    contract = await AztecAddress.random();
    scope = await AztecAddress.random();
    scopeB = await AztecAddress.random();
    factCollectionTypeId = Fr.random();
    factTypeA = Fr.random();
    factTypeB = Fr.random();
    collectionId1 = Fr.random();
    collectionId2 = Fr.random();
    collectionKey1 = FactCollectionKey.from({
      contractAddress: contract,
      factCollectionTypeId,
      factCollectionId: collectionId1,
    });
    collectionKey2 = FactCollectionKey.from({
      contractAddress: contract,
      factCollectionTypeId,
      factCollectionId: collectionId2,
    });
    typeKey = FactCollectionTypeKey.from({ contractAddress: contract, factCollectionTypeId });

    kv = await openTmpStore('fact-store-test');
    store = new FactStore(kv);
  });
  afterEach(async () => {
    await kv.close();
  });

  const collectionIdsOf = (collections: { key: FactCollectionKey }[]) => collections.map(c => c.key.factCollectionId);
  // Facts come back in no guaranteed order, so fact projections are compared as sets of hex strings.
  const hexSet = (frs: Fr[]) => new Set(frs.map(f => f.toString()));

  describe('recording and reading', () => {
    it('records facts and reads a collection back after commit (implicit collection creation)', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(collectionKey1, factTypeB, [], { blockNumber: 5, blockHash: Fr.random() }, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const { facts } = (await store.getFactCollection(collectionKey1, [scope], JOB))!;
      expect(hexSet(facts.map(f => f.factTypeId))).toEqual(hexSet([factTypeA, factTypeB]));
    });

    it('getFactCollection returns undefined when no collection exists', async () => {
      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeUndefined();
    });

    it('lists a collection via getFactCollectionsByType', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const collections = await store.getFactCollectionsByType(typeKey, [scope], JOB);
      expect(hexSet(collectionIdsOf(collections))).toEqual(hexSet([collectionId1, collectionId2]));
    });

    it('getFactCollectionsByType returns each collection complete with its facts', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const collections = await store.getFactCollectionsByType(typeKey, [scope], JOB);
      expect(collections).toHaveLength(1);
      expect(hexSet(collections[0].facts.map(f => f.factTypeId))).toEqual(hexSet([factTypeA, factTypeB]));
    });
  });

  describe('idempotency and dedup', () => {
    it('dedups identical (collection, factType, payload, originBlock) fact records', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, scope, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getFactCollection(collectionKey1, [scope], JOB))!.facts).toHaveLength(1);
    });

    it('the same payload at a different origin block is a distinct fact', async () => {
      const payload = Fr.random();
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 5, blockHash: Fr.random() },
        scope,
        JOB,
      );
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 10, blockHash: Fr.random() },
        scope,
        JOB,
      );
      await kv.transactionAsync(() => store.commit(JOB));

      const { facts } = (await store.getFactCollection(collectionKey1, [scope], JOB))!;
      expect(facts).toHaveLength(2);
      expect(new Set(facts.map(f => f.originBlock?.blockNumber))).toEqual(new Set([5, 10]));
    });

    it('re-recording an identical fact across jobs is a no-op', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'rerecord-job';
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, scope, JOB2);
      await kv.transactionAsync(() => store.commit(JOB2));

      expect((await store.getFactCollection(collectionKey1, [scope], JOB))!.facts).toHaveLength(1);
    });
  });

  describe('scope dimension', () => {
    it('a fact recorded under one scope is invisible to another', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeDefined();
      expect(await store.getFactCollection(collectionKey1, [scopeB], JOB)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, [scopeB], JOB)).toHaveLength(0);
    });

    it('querying with no scopes returns nothing', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect(await store.getFactCollection(collectionKey1, [], JOB)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, [], JOB)).toHaveLength(0);
    });

    it('the same fact recorded under two scopes is stored once but visible to both', async () => {
      const payload = Fr.random();
      const origin = { blockNumber: 5, blockHash: Fr.random() };
      await store.recordFact(collectionKey1, factTypeA, [payload], origin, scope, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], origin, scopeB, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Deduped to a single fact, yet the collection is visible under each scope and under both together.
      expect((await store.getFactCollection(collectionKey1, [scope], JOB))!.facts).toHaveLength(1);
      expect((await store.getFactCollection(collectionKey1, [scopeB], JOB))!.facts).toHaveLength(1);
      expect((await store.getFactCollection(collectionKey1, [scope, scopeB], JOB))!.facts).toHaveLength(1);
    });

    it('scoping is per fact: a scope never sees facts recorded solely under another scope, even in the same collection', async () => {
      // factA recorded under `scope`, factB under `scopeB`, both in the same collection.
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, scopeB, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Each scope sees only the fact it recorded; querying both returns both.
      expect((await store.getFactCollection(collectionKey1, [scope], JOB))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeA,
      ]);
      expect((await store.getFactCollection(collectionKey1, [scopeB], JOB))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
      expect(
        hexSet((await store.getFactCollection(collectionKey1, [scope, scopeB], JOB))!.facts.map(f => f.factTypeId)),
      ).toEqual(hexSet([factTypeA, factTypeB]));
    });

    it('getFactCollectionsByType filters collections by scope', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, scopeB, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, [scope], JOB))).toEqual([collectionId1]);
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, [scopeB], JOB))).toEqual([collectionId2]);
      expect(hexSet(collectionIdsOf(await store.getFactCollectionsByType(typeKey, [scope, scopeB], JOB)))).toEqual(
        hexSet([collectionId1, collectionId2]),
      );
    });
  });

  describe('read-your-writes', () => {
    it("reflects a job's own staged facts before commit; other jobs do not see them", async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);

      expect((await store.getFactCollection(collectionKey1, [scope], JOB))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeA,
      ]);
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, [scope], JOB))).toEqual([collectionId1]);

      expect(await store.getFactCollection(collectionKey1, [scope], 'other-job')).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, [scope], 'other-job')).toHaveLength(0);
    });

    it('staged facts combine with committed ones', async () => {
      const payloads = Array.from({ length: 4 }, () => Fr.random());
      await store.recordFact(collectionKey1, factTypeA, [payloads[0]], undefined, scope, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payloads[1]], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'staged-job';
      await store.recordFact(collectionKey1, factTypeA, [payloads[2]], undefined, scope, JOB2);
      await store.recordFact(collectionKey1, factTypeA, [payloads[3]], undefined, scope, JOB2);

      const { facts } = (await store.getFactCollection(collectionKey1, [scope], JOB2))!;
      expect(hexSet(facts.map(f => f.payload[0]))).toEqual(hexSet(payloads));
    });
  });

  describe('removeFactCollection (descope)', () => {
    it('removes the calling scope from the collection, reaping facts it solely held', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.removeFactCollection(collectionKey1, scope, DEL);
      await kv.transactionAsync(() => store.commit(DEL));

      // Gone for the scope that descoped it; the neighbouring collection is untouched.
      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeUndefined();
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, [scope], JOB))).toEqual([collectionId2]);
    });

    it('only descopes the calling scope: facts another scope still references survive', async () => {
      const shared = Fr.random();
      const origin = { blockNumber: 5, blockHash: Fr.random() };
      // A fact visible to both scopes, plus a fact visible only to scopeB.
      await store.recordFact(collectionKey1, factTypeA, [shared], origin, scope, JOB);
      await store.recordFact(collectionKey1, factTypeA, [shared], origin, scopeB, JOB);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, scopeB, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.removeFactCollection(collectionKey1, scope, DEL);
      await kv.transactionAsync(() => store.commit(DEL));

      // `scope` no longer sees the collection at all.
      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeUndefined();
      // `scopeB` still sees both of its facts (the shared one survived because scopeB still references it).
      expect(
        hexSet((await store.getFactCollection(collectionKey1, [scopeB], JOB))!.facts.map(f => f.factTypeId)),
      ).toEqual(hexSet([factTypeA, factTypeB]));
    });

    it('is a no-op for a collection not visible under the calling scope', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // collectionKey1 exists, but not under scopeB; collectionKey2 does not exist at all. Both descopes are no-ops.
      const DEL = 'delete-job';
      await store.removeFactCollection(collectionKey1, scopeB, DEL);
      await store.removeFactCollection(collectionKey2, scope, DEL);
      await kv.transactionAsync(() => store.commit(DEL));

      // collectionKey1 is untouched: still visible under `scope` with its fact.
      expect((await store.getFactCollection(collectionKey1, [scope], JOB))!.facts).toHaveLength(1);
    });

    it('hides a collection from its own job after a staged descope, even over committed facts', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.removeFactCollection(collectionKey1, scope, DEL);

      expect(await store.getFactCollection(collectionKey1, [scope], DEL)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, [scope], DEL)).toHaveLength(0);
      // Other jobs still see it committed until the descope commits.
      expect((await store.getFactCollection(collectionKey1, [scope], 'reader'))!.facts).toHaveLength(1);
    });

    it('a staged descope-then-record re-creates the collection within the same job', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'recreate-job';
      await store.removeFactCollection(collectionKey1, scope, JOB2);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, scope, JOB2);

      const { facts } = (await store.getFactCollection(collectionKey1, [scope], JOB2))!;
      expect(facts.map(f => f.factTypeId)).toEqual([factTypeB]);

      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getFactCollection(collectionKey1, [scope], 'reader'))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('a staged record-then-descope leaves the collection deleted', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.removeFactCollection(collectionKey1, scope, JOB);

      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeUndefined();

      await kv.transactionAsync(() => store.commit(JOB));
      expect(await store.getFactCollection(collectionKey1, [scope], 'reader')).toBeUndefined();
    });
  });

  describe('rollback and retraction', () => {
    it('removes retractable facts above the target block and keeps non-retractable ones', async () => {
      const nonRetractable = Fr.random();
      const retractable = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [nonRetractable], undefined, scope, JOB);
      await store.recordFact(
        collectionKey1,
        factTypeB,
        [retractable],
        { blockNumber: 6, blockHash: Fr.random() },
        scope,
        JOB,
      );
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      const { facts } = (await store.getFactCollection(collectionKey1, [scope], JOB))!;
      expect(hexSet(facts.map(f => f.payload[0]))).toEqual(hexSet([nonRetractable]));
    });

    it('a collection left with no facts after retraction disappears', async () => {
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [Fr.random()],
        { blockNumber: 6, blockHash: Fr.random() },
        scope,
        JOB,
      );
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, [scope], JOB)).toHaveLength(0);
    });

    it('the same payload at two origin blocks yields independent facts pruned per block', async () => {
      const payload = Fr.random();
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 5, blockHash: Fr.random() },
        scope,
        JOB,
      );
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 10, blockHash: Fr.random() },
        scope,
        JOB,
      );
      await kv.transactionAsync(() => store.commit(JOB));

      // Prune above block 7: the block-10 derivation is deleted, the block-5 one survives.
      await kv.transactionAsync(() => store.rollback(7));
      expect(
        (await store.getFactCollection(collectionKey1, [scope], JOB))!.facts.map(f => f.originBlock?.blockNumber),
      ).toEqual([5]);
      await store.discardStaged(JOB); // discard job so the next rollback isn't blocked

      // Prune above block 4: the block-5 derivation is deleted too, emptying the collection.
      await kv.transactionAsync(() => store.rollback(4));
      expect(await store.getFactCollection(collectionKey1, [scope], JOB)).toBeUndefined();
    });

    it('rollback throws while a job has staged writes', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, 'uncommitted-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
        'PXE fact store rollback is not allowed while jobs are running',
      );
      await store.discardStaged('uncommitted-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('a job that has only read still blocks rollback until it is discarded', async () => {
      await store.getFactCollection(collectionKey1, [scope], 'reader-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
        'PXE fact store rollback is not allowed while jobs are running',
      );
      await store.discardStaged('reader-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });
  });

  describe('isolation', () => {
    it('collections under different contracts and types are isolated', async () => {
      const contract2 = await AztecAddress.random();
      const type2 = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await store.recordFact(
        FactCollectionKey.from({ contractAddress: contract2, factCollectionTypeId, factCollectionId: collectionId1 }),
        factTypeA,
        [Fr.random()],
        undefined,
        scope,
        JOB,
      );
      await store.recordFact(
        FactCollectionKey.from({
          contractAddress: contract,
          factCollectionTypeId: type2,
          factCollectionId: collectionId1,
        }),
        factTypeA,
        [Fr.random()],
        undefined,
        scope,
        JOB,
      );
      await kv.transactionAsync(() => store.commit(JOB));

      expect(await store.getFactCollectionsByType(typeKey, [scope], JOB)).toHaveLength(1);
      expect(
        await store.getFactCollectionsByType(
          FactCollectionTypeKey.from({ contractAddress: contract2, factCollectionTypeId }),
          [scope],
          JOB,
        ),
      ).toHaveLength(1);
      expect(
        await store.getFactCollectionsByType(
          FactCollectionTypeKey.from({ contractAddress: contract, factCollectionTypeId: type2 }),
          [scope],
          JOB,
        ),
      ).toHaveLength(1);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's facts", async () => {
      const payloads = [Fr.random(), Fr.random()];
      await store.recordFact(collectionKey1, factTypeA, [payloads[0]], undefined, scope, JOB);
      const JOB2 = 'second-job';
      await store.recordFact(collectionKey1, factTypeA, [payloads[1]], undefined, scope, JOB2);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only job 1's fact is committed; job 2 still layers its staged fact on top.
      expect((await store.getFactCollection(collectionKey1, [scope], 'reader'))!.facts.map(f => f.payload[0])).toEqual([
        payloads[0],
      ]);
      expect(
        hexSet((await store.getFactCollection(collectionKey1, [scope], JOB2))!.facts.map(f => f.payload[0])),
      ).toEqual(hexSet(payloads));

      await kv.transactionAsync(() => store.commit(JOB2));
      expect(
        hexSet((await store.getFactCollection(collectionKey1, [scope], 'reader'))!.facts.map(f => f.payload[0])),
      ).toEqual(hexSet(payloads));
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, scope, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, scope, JOB2);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, scope, JOB2);
      await store.discardStaged(JOB2);

      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, [scope], JOB2))).toEqual([collectionId1]);
      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getFactCollection(collectionKey1, [scope], 'reader'))!.facts).toHaveLength(1);
      expect(await store.getFactCollection(collectionKey2, [scope], 'reader')).toBeUndefined();
    });

    it('a fact recorded by two jobs racing to the same collection dedups on commit', async () => {
      const payload = Fr.random();
      const JOB2 = 'racing-job';
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, scope, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, scope, JOB2);

      await kv.transactionAsync(() => store.commit(JOB));
      await expect(kv.transactionAsync(() => store.commit(JOB2))).resolves.not.toThrow();

      expect((await store.getFactCollection(collectionKey1, [scope], 'reader'))!.facts).toHaveLength(1);
    });
  });
});
