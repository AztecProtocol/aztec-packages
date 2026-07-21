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
  let collectionKey1ScopeB: FactCollectionKey;
  let typeKey: FactCollectionTypeKey;
  let typeKeyScopeB: FactCollectionTypeKey;
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
      scope,
      factCollectionTypeId,
      factCollectionId: collectionId1,
    });
    collectionKey2 = FactCollectionKey.from({
      contractAddress: contract,
      scope,
      factCollectionTypeId,
      factCollectionId: collectionId2,
    });
    collectionKey1ScopeB = FactCollectionKey.from({
      contractAddress: contract,
      scope: scopeB,
      factCollectionTypeId,
      factCollectionId: collectionId1,
    });
    typeKey = FactCollectionTypeKey.from({ contractAddress: contract, scope, factCollectionTypeId });
    typeKeyScopeB = FactCollectionTypeKey.from({ contractAddress: contract, scope: scopeB, factCollectionTypeId });

    kv = await openTmpStore('fact-store-test');
    store = new FactStore(kv);
  });
  afterEach(async () => {
    await kv.close();
  });

  const collectionIdsOf = (collections: { key: FactCollectionKey }[]) => collections.map(c => c.key.factCollectionId);
  const hexSet = (frs: Fr[]) => new Set(frs.map(f => f.toString()));

  describe('recording and reading', () => {
    it('records facts and reads a collection back after commit (implicit collection creation)', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(collectionKey1, factTypeB, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const { facts } = (await store.getFactCollection(collectionKey1, JOB))!;
      expect(hexSet(facts.map(f => f.factTypeId))).toEqual(hexSet([factTypeA, factTypeB]));
    });

    it('getFactCollection returns undefined when no collection exists', async () => {
      expect(await store.getFactCollection(collectionKey1, JOB)).toBeUndefined();
    });

    it('lists collections via getFactCollectionsByType', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const collections = await store.getFactCollectionsByType(typeKey, JOB);
      expect(hexSet(collectionIdsOf(collections))).toEqual(hexSet([collectionId1, collectionId2]));
    });

    it('getFactCollectionsByType returns each collection complete with its facts', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const collections = await store.getFactCollectionsByType(typeKey, JOB);
      expect(collections).toHaveLength(1);
      expect(hexSet(collections[0].facts.map(f => f.factTypeId))).toEqual(hexSet([factTypeA, factTypeB]));
    });
  });

  describe('idempotency and dedup', () => {
    it('dedups identical (collection, factType, payload, originBlock) fact records', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getFactCollection(collectionKey1, JOB))!.facts).toHaveLength(1);
    });

    it('the same payload at a different origin block is a distinct fact', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], { blockNumber: 10, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const { facts } = (await store.getFactCollection(collectionKey1, JOB))!;
      expect(facts).toHaveLength(2);
      expect(new Set(facts.map(f => f.originBlock?.blockNumber))).toEqual(new Set([5, 10]));
    });

    it('re-recording an identical fact across jobs is a no-op', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'rerecord-job';
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB2));

      expect((await store.getFactCollection(collectionKey1, JOB))!.facts).toHaveLength(1);
    });
  });

  describe('scope isolation', () => {
    it('a collection recorded under one scope is a different collection under another scope', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect(await store.getFactCollection(collectionKey1, JOB)).toBeDefined();
      expect(await store.getFactCollection(collectionKey1ScopeB, JOB)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKeyScopeB, JOB)).toHaveLength(0);
    });

    it('the same (contract, type, id) under two scopes are independent collections', async () => {
      const payload = Fr.random();
      const origin = { blockNumber: 5, blockHash: Fr.random() };
      await store.recordFact(collectionKey1, factTypeA, [payload], origin, JOB);
      await store.recordFact(collectionKey1ScopeB, factTypeB, [payload], origin, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getFactCollection(collectionKey1, JOB))!.facts.map(f => f.factTypeId)).toEqual([factTypeA]);
      expect((await store.getFactCollection(collectionKey1ScopeB, JOB))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('getFactCollectionsByType only returns collections for the queried scope', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(collectionKey1ScopeB, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, JOB))).toEqual([collectionId1]);
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKeyScopeB, JOB))).toEqual([collectionId1]);
    });
  });

  describe('read-your-writes', () => {
    it("reflects a job's own staged facts before commit; other jobs do not see them", async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);

      expect((await store.getFactCollection(collectionKey1, JOB))!.facts.map(f => f.factTypeId)).toEqual([factTypeA]);
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, JOB))).toEqual([collectionId1]);

      expect(await store.getFactCollection(collectionKey1, 'other-job')).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, 'other-job')).toHaveLength(0);
    });

    it('staged facts combine with committed ones', async () => {
      const payloads = Array.from({ length: 4 }, () => Fr.random());
      await store.recordFact(collectionKey1, factTypeA, [payloads[0]], undefined, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payloads[1]], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'staged-job';
      await store.recordFact(collectionKey1, factTypeA, [payloads[2]], undefined, JOB2);
      await store.recordFact(collectionKey1, factTypeA, [payloads[3]], undefined, JOB2);

      const { facts } = (await store.getFactCollection(collectionKey1, JOB2))!;
      expect(hexSet(facts.map(f => f.payload[0]))).toEqual(hexSet(payloads));
    });
  });

  describe('deleteFactCollection', () => {
    it('deletes the collection and leaves neighbouring collections untouched', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.deleteFactCollection(collectionKey1, DEL);
      await kv.transactionAsync(() => store.commit(DEL));

      expect(await store.getFactCollection(collectionKey1, JOB)).toBeUndefined();
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, JOB))).toEqual([collectionId2]);
    });

    it('only deletes the queried scope: the same (contract,type,id) under another scope survives', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(collectionKey1ScopeB, factTypeB, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.deleteFactCollection(collectionKey1, DEL);
      await kv.transactionAsync(() => store.commit(DEL));

      expect(await store.getFactCollection(collectionKey1, JOB)).toBeUndefined();
      expect((await store.getFactCollection(collectionKey1ScopeB, JOB))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('is a no-op for a collection that does not exist', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.deleteFactCollection(collectionKey2, DEL);
      await kv.transactionAsync(() => store.commit(DEL));

      expect((await store.getFactCollection(collectionKey1, JOB))!.facts).toHaveLength(1);
    });

    it('hides a collection from its own job after a staged delete, even over committed facts', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const DEL = 'delete-job';
      await store.deleteFactCollection(collectionKey1, DEL);

      expect(await store.getFactCollection(collectionKey1, DEL)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, DEL)).toHaveLength(0);
      expect((await store.getFactCollection(collectionKey1, 'reader'))!.facts).toHaveLength(1);
    });

    it('a staged delete-then-record re-creates the collection within the same job', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'recreate-job';
      await store.deleteFactCollection(collectionKey1, JOB2);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, JOB2);

      const { facts } = (await store.getFactCollection(collectionKey1, JOB2))!;
      expect(facts.map(f => f.factTypeId)).toEqual([factTypeB]);

      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getFactCollection(collectionKey1, 'reader'))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('a staged record-then-delete leaves the collection deleted', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.deleteFactCollection(collectionKey1, JOB);

      expect(await store.getFactCollection(collectionKey1, JOB)).toBeUndefined();

      await kv.transactionAsync(() => store.commit(JOB));
      expect(await store.getFactCollection(collectionKey1, 'reader')).toBeUndefined();
    });
  });

  describe('rollback and retraction', () => {
    it('removes retractable facts above the target block and keeps non-retractable ones', async () => {
      const nonRetractable = Fr.random();
      const retractable = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [nonRetractable], undefined, JOB);
      await store.recordFact(collectionKey1, factTypeB, [retractable], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      const { facts } = (await store.getFactCollection(collectionKey1, JOB))!;
      expect(hexSet(facts.map(f => f.payload[0]))).toEqual(hexSet([nonRetractable]));
    });

    it('a collection left with no facts after retraction disappears', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      expect(await store.getFactCollection(collectionKey1, JOB)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, JOB)).toHaveLength(0);
    });

    it('the same payload at two origin blocks yields independent facts pruned per block', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], { blockNumber: 10, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(7));
      expect((await store.getFactCollection(collectionKey1, JOB))!.facts.map(f => f.originBlock?.blockNumber)).toEqual([
        5,
      ]);
      await store.discardStaged(JOB);

      await kv.transactionAsync(() => store.rollback(4));
      expect(await store.getFactCollection(collectionKey1, JOB)).toBeUndefined();
    });

    it('rollback throws while a job has staged writes', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, 'uncommitted-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
        'PXE fact store rollback is not allowed while jobs are running',
      );
      await store.discardStaged('uncommitted-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('a job that has only read still blocks rollback until it is discarded', async () => {
      await store.getFactCollection(collectionKey1, 'reader-job');
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
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.recordFact(
        FactCollectionKey.from({
          contractAddress: contract2,
          scope,
          factCollectionTypeId,
          factCollectionId: collectionId1,
        }),
        factTypeA,
        [Fr.random()],
        undefined,
        JOB,
      );
      await store.recordFact(
        FactCollectionKey.from({
          contractAddress: contract,
          scope,
          factCollectionTypeId: type2,
          factCollectionId: collectionId1,
        }),
        factTypeA,
        [Fr.random()],
        undefined,
        JOB,
      );
      await kv.transactionAsync(() => store.commit(JOB));

      expect(await store.getFactCollectionsByType(typeKey, JOB)).toHaveLength(1);
      expect(
        await store.getFactCollectionsByType(
          FactCollectionTypeKey.from({ contractAddress: contract2, scope, factCollectionTypeId }),
          JOB,
        ),
      ).toHaveLength(1);
      expect(
        await store.getFactCollectionsByType(
          FactCollectionTypeKey.from({ contractAddress: contract, scope, factCollectionTypeId: type2 }),
          JOB,
        ),
      ).toHaveLength(1);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's facts", async () => {
      const payloads = [Fr.random(), Fr.random()];
      await store.recordFact(collectionKey1, factTypeA, [payloads[0]], undefined, JOB);
      const JOB2 = 'second-job';
      await store.recordFact(collectionKey1, factTypeA, [payloads[1]], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getFactCollection(collectionKey1, 'reader'))!.facts.map(f => f.payload[0])).toEqual([
        payloads[0],
      ]);
      expect(hexSet((await store.getFactCollection(collectionKey1, JOB2))!.facts.map(f => f.payload[0]))).toEqual(
        hexSet(payloads),
      );

      await kv.transactionAsync(() => store.commit(JOB2));
      expect(hexSet((await store.getFactCollection(collectionKey1, 'reader'))!.facts.map(f => f.payload[0]))).toEqual(
        hexSet(payloads),
      );
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, JOB2);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, JOB2);
      await store.discardStaged(JOB2);

      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, JOB2))).toEqual([collectionId1]);
      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getFactCollection(collectionKey1, 'reader'))!.facts).toHaveLength(1);
      expect(await store.getFactCollection(collectionKey2, 'reader')).toBeUndefined();
    });

    it('a fact recorded by two jobs racing to the same collection dedups on commit', async () => {
      const payload = Fr.random();
      const JOB2 = 'racing-job';
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, JOB);
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, JOB2);

      await kv.transactionAsync(() => store.commit(JOB));
      await expect(kv.transactionAsync(() => store.commit(JOB2))).resolves.not.toThrow();

      expect((await store.getFactCollection(collectionKey1, 'reader'))!.facts).toHaveLength(1);
    });
  });
});
