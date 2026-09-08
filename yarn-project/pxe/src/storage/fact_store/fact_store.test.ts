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
  const CHANGE_SET = 'fact-store-test-change-set';

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

    // Leave a change set open for the tests to operate under: every store operation requires one.
    store.beginChangeSet(CHANGE_SET);
  });
  afterEach(async () => {
    await kv.close();
  });

  const collectionIdsOf = (collections: { key: FactCollectionKey }[]) => collections.map(c => c.key.factCollectionId);
  const hexSet = (frs: Fr[]) => new Set(frs.map(f => f.toString()));

  // Commits the open change set and opens it again: a commit closes the change set, and every operation needs one open.
  const commit = async (changeSetId: string = CHANGE_SET) => {
    await kv.transactionAsync(() => store.commitChangeSet(changeSetId));
    store.beginChangeSet(changeSetId);
  };

  // Ends the open change set and opens `next` in its place: only one change set may be open at a time.
  const switchTo = (next: string, current: string = CHANGE_SET) => {
    store.discardChangeSet(current);
    store.beginChangeSet(next);
  };

  // Rolls back with no change set open, since the store refuses a rollback while one is, and reopens it afterwards.
  const rollbackTo = async (toBlock: number, changeSetId: string = CHANGE_SET) => {
    store.discardChangeSet(changeSetId);
    await kv.transactionAsync(() => store.rollbackToBlock(toBlock));
    store.beginChangeSet(changeSetId);
  };

  describe('recording and reading', () => {
    it('records facts and reads a collection back after commit (implicit collection creation)', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.recordFact(collectionKey1, factTypeB, [], { blockNumber: 5, blockHash: Fr.random() }, CHANGE_SET);
      await commit();

      const { facts } = (await store.getFactCollection(collectionKey1, CHANGE_SET))!;
      expect(hexSet(facts.map(f => f.factTypeId))).toEqual(hexSet([factTypeA, factTypeB]));
    });

    it('getFactCollection returns undefined when no collection exists', async () => {
      expect(await store.getFactCollection(collectionKey1, CHANGE_SET)).toBeUndefined();
    });

    it('lists collections via getFactCollectionsByType', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const collections = await store.getFactCollectionsByType(typeKey, CHANGE_SET);
      expect(hexSet(collectionIdsOf(collections))).toEqual(hexSet([collectionId1, collectionId2]));
    });

    it('getFactCollectionsByType returns each collection complete with its facts', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const collections = await store.getFactCollectionsByType(typeKey, CHANGE_SET);
      expect(collections).toHaveLength(1);
      expect(hexSet(collections[0].facts.map(f => f.factTypeId))).toEqual(hexSet([factTypeA, factTypeB]));
    });
  });

  describe('idempotency and dedup', () => {
    it('dedups identical (collection, factType, payload, originBlock) fact records', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, CHANGE_SET);
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, CHANGE_SET);
      await commit();

      expect((await store.getFactCollection(collectionKey1, CHANGE_SET))!.facts).toHaveLength(1);
    });

    it('the same payload at a different origin block is a distinct fact', async () => {
      const payload = Fr.random();
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 5, blockHash: Fr.random() },
        CHANGE_SET,
      );
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 10, blockHash: Fr.random() },
        CHANGE_SET,
      );
      await commit();

      const { facts } = (await store.getFactCollection(collectionKey1, CHANGE_SET))!;
      expect(facts).toHaveLength(2);
      expect(new Set(facts.map(f => f.originBlock?.blockNumber))).toEqual(new Set([5, 10]));
    });

    it('re-recording an identical fact across change sets is a no-op', async () => {
      const payload = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, CHANGE_SET);
      await commit();

      const CHANGE_SET_2 = 'rerecord-change-set';
      switchTo(CHANGE_SET_2);
      await store.recordFact(collectionKey1, factTypeA, [payload], undefined, CHANGE_SET_2);
      await commit(CHANGE_SET_2);

      expect((await store.getFactCollection(collectionKey1, CHANGE_SET_2))!.facts).toHaveLength(1);
    });
  });

  describe('scope isolation', () => {
    it('a collection recorded under one scope is a different collection under another scope', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      expect(await store.getFactCollection(collectionKey1, CHANGE_SET)).toBeDefined();
      expect(await store.getFactCollection(collectionKey1ScopeB, CHANGE_SET)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKeyScopeB, CHANGE_SET)).toHaveLength(0);
    });

    it('the same (contract, type, id) under two scopes are independent collections', async () => {
      const payload = Fr.random();
      const origin = { blockNumber: 5, blockHash: Fr.random() };
      await store.recordFact(collectionKey1, factTypeA, [payload], origin, CHANGE_SET);
      await store.recordFact(collectionKey1ScopeB, factTypeB, [payload], origin, CHANGE_SET);
      await commit();

      expect((await store.getFactCollection(collectionKey1, CHANGE_SET))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeA,
      ]);
      expect((await store.getFactCollection(collectionKey1ScopeB, CHANGE_SET))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('getFactCollectionsByType only returns collections for the queried scope', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.recordFact(collectionKey1ScopeB, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, CHANGE_SET))).toEqual([collectionId1]);
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKeyScopeB, CHANGE_SET))).toEqual([collectionId1]);
    });
  });

  describe('read-your-writes', () => {
    it("reflects a change set's own staged facts before commit", async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);

      expect((await store.getFactCollection(collectionKey1, CHANGE_SET))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeA,
      ]);
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, CHANGE_SET))).toEqual([collectionId1]);
    });

    it('staged facts combine with committed ones', async () => {
      const payloads = Array.from({ length: 4 }, () => Fr.random());
      await store.recordFact(collectionKey1, factTypeA, [payloads[0]], undefined, CHANGE_SET);
      await store.recordFact(collectionKey1, factTypeA, [payloads[1]], undefined, CHANGE_SET);
      await commit();

      const CHANGE_SET_2 = 'staged-change-set';
      switchTo(CHANGE_SET_2);
      await store.recordFact(collectionKey1, factTypeA, [payloads[2]], undefined, CHANGE_SET_2);
      await store.recordFact(collectionKey1, factTypeA, [payloads[3]], undefined, CHANGE_SET_2);

      const { facts } = (await store.getFactCollection(collectionKey1, CHANGE_SET_2))!;
      expect(hexSet(facts.map(f => f.payload[0]))).toEqual(hexSet(payloads));
    });
  });

  describe('deleteFactCollection', () => {
    it('deletes the collection and leaves neighbouring collections untouched', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.recordFact(collectionKey2, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const DEL = 'delete-change-set';
      switchTo(DEL);
      await store.deleteFactCollection(collectionKey1, DEL);
      await commit(DEL);

      expect(await store.getFactCollection(collectionKey1, DEL)).toBeUndefined();
      expect(collectionIdsOf(await store.getFactCollectionsByType(typeKey, DEL))).toEqual([collectionId2]);
    });

    it('only deletes the queried scope: the same (contract,type,id) under another scope survives', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.recordFact(collectionKey1ScopeB, factTypeB, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const DEL = 'delete-change-set';
      switchTo(DEL);
      await store.deleteFactCollection(collectionKey1, DEL);
      await commit(DEL);

      expect(await store.getFactCollection(collectionKey1, DEL)).toBeUndefined();
      expect((await store.getFactCollection(collectionKey1ScopeB, DEL))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('is a no-op for a collection that does not exist', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const DEL = 'delete-change-set';
      switchTo(DEL);
      await store.deleteFactCollection(collectionKey2, DEL);
      await commit(DEL);

      expect((await store.getFactCollection(collectionKey1, DEL))!.facts).toHaveLength(1);
    });

    it('hides a collection from its own change set after a staged delete, even over committed facts', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const DEL = 'delete-change-set';
      switchTo(DEL);
      await store.deleteFactCollection(collectionKey1, DEL);

      expect(await store.getFactCollection(collectionKey1, DEL)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, DEL)).toHaveLength(0);

      // Discarding the staged delete leaves the committed facts in place.
      switchTo('reader', DEL);
      expect((await store.getFactCollection(collectionKey1, 'reader'))!.facts).toHaveLength(1);
    });

    it('a staged delete-then-record re-creates the collection within the same change set', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await commit();

      const CHANGE_SET_2 = 'recreate-change-set';
      switchTo(CHANGE_SET_2);
      await store.deleteFactCollection(collectionKey1, CHANGE_SET_2);
      await store.recordFact(collectionKey1, factTypeB, [Fr.random()], undefined, CHANGE_SET_2);

      const { facts } = (await store.getFactCollection(collectionKey1, CHANGE_SET_2))!;
      expect(facts.map(f => f.factTypeId)).toEqual([factTypeB]);

      await commit(CHANGE_SET_2);
      expect((await store.getFactCollection(collectionKey1, CHANGE_SET_2))!.facts.map(f => f.factTypeId)).toEqual([
        factTypeB,
      ]);
    });

    it('a staged record-then-delete leaves the collection deleted', async () => {
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
      await store.deleteFactCollection(collectionKey1, CHANGE_SET);

      expect(await store.getFactCollection(collectionKey1, CHANGE_SET)).toBeUndefined();

      await commit();
      expect(await store.getFactCollection(collectionKey1, CHANGE_SET)).toBeUndefined();
    });
  });

  describe('rollback and retraction', () => {
    it('removes retractable facts above the target block and keeps non-retractable ones', async () => {
      const nonRetractable = Fr.random();
      const retractable = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [nonRetractable], undefined, CHANGE_SET);
      await store.recordFact(
        collectionKey1,
        factTypeB,
        [retractable],
        { blockNumber: 6, blockHash: Fr.random() },
        CHANGE_SET,
      );
      await commit();

      await rollbackTo(5);

      const { facts } = (await store.getFactCollection(collectionKey1, CHANGE_SET))!;
      expect(hexSet(facts.map(f => f.payload[0]))).toEqual(hexSet([nonRetractable]));
    });

    it('a collection left with no facts after retraction disappears', async () => {
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [Fr.random()],
        { blockNumber: 6, blockHash: Fr.random() },
        CHANGE_SET,
      );
      await commit();

      await rollbackTo(5);

      expect(await store.getFactCollection(collectionKey1, CHANGE_SET)).toBeUndefined();
      expect(await store.getFactCollectionsByType(typeKey, CHANGE_SET)).toHaveLength(0);
    });

    it('the same payload at two origin blocks yields independent facts pruned per block', async () => {
      const payload = Fr.random();
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 5, blockHash: Fr.random() },
        CHANGE_SET,
      );
      await store.recordFact(
        collectionKey1,
        factTypeA,
        [payload],
        { blockNumber: 10, blockHash: Fr.random() },
        CHANGE_SET,
      );
      await commit();

      await rollbackTo(7);
      expect(
        (await store.getFactCollection(collectionKey1, CHANGE_SET))!.facts.map(f => f.originBlock?.blockNumber),
      ).toEqual([5]);

      await rollbackTo(4);
      expect(await store.getFactCollection(collectionKey1, CHANGE_SET)).toBeUndefined();
    });
  });

  describe('isolation', () => {
    it('collections under different contracts and types are isolated', async () => {
      const contract2 = await AztecAddress.random();
      const type2 = Fr.random();
      await store.recordFact(collectionKey1, factTypeA, [Fr.random()], undefined, CHANGE_SET);
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
        CHANGE_SET,
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
        CHANGE_SET,
      );
      await commit();

      expect(await store.getFactCollectionsByType(typeKey, CHANGE_SET)).toHaveLength(1);
      expect(
        await store.getFactCollectionsByType(
          FactCollectionTypeKey.from({ contractAddress: contract2, scope, factCollectionTypeId }),
          CHANGE_SET,
        ),
      ).toHaveLength(1);
      expect(
        await store.getFactCollectionsByType(
          FactCollectionTypeKey.from({ contractAddress: contract, scope, factCollectionTypeId: type2 }),
          CHANGE_SET,
        ),
      ).toHaveLength(1);
    });
  });
});
