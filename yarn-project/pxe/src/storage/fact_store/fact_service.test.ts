import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactService } from './fact_service.js';
import { FactStore } from './fact_store.js';
import { FactCollectionKey, FactCollectionTypeKey } from './fact_store_keys.js';
import { OriginBlockState, type TipBlockNumbers } from './origin_state.js';

describe('FactService', () => {
  const makeTips = (finalized: number, proven: number): TipBlockNumbers => ({
    finalizedBlockNumber: finalized,
    provenBlockNumber: proven,
  });

  let kv: AztecAsyncKVStore;
  let store: FactStore;

  const jobId = 'job-1';
  const contract = AztecAddress.fromFieldUnsafe(new Fr(1));
  const allowedScope = AztecAddress.fromFieldUnsafe(new Fr(2));
  const disallowedScope = AztecAddress.fromFieldUnsafe(new Fr(3));
  const typeId = new Fr(10);
  const collectionId = new Fr(20);
  const factTypeId = new Fr(30);
  const factPayload = new Fr(40);

  const factCollectionKey = new FactCollectionKey(contract, allowedScope, typeId, collectionId);
  const factCollectionTypeKey = new FactCollectionTypeKey(contract, allowedScope, typeId);
  const disallowedCollectionKey = new FactCollectionKey(contract, disallowedScope, typeId, collectionId);
  const disallowedCollectionTypeKey = new FactCollectionTypeKey(contract, disallowedScope, typeId);

  beforeEach(async () => {
    kv = await openTmpStore('fact-service-test');
    store = new FactStore(kv);
  });

  it('delegates record+get for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(factCollectionKey, factTypeId, [factPayload], undefined, jobId);

    const collection = await service.getFactCollection(factCollectionKey, makeTips(0, 0), jobId);
    expect(collection?.facts).toEqual([{ factTypeId, payload: [factPayload], originBlock: undefined }]);
  });

  it('delegates getFactCollectionsByType for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(factCollectionKey, factTypeId, [factPayload], undefined, jobId);

    const collections = await service.getFactCollectionsByType(factCollectionTypeKey, makeTips(0, 0), jobId);
    expect(collections).toEqual([
      { key: factCollectionKey, facts: [{ factTypeId, payload: [factPayload], originBlock: undefined }] },
    ]);
  });

  it('delegates deleteFactCollection for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(factCollectionKey, factTypeId, [factPayload], undefined, jobId);
    await service.deleteFactCollection(factCollectionKey, jobId);

    expect(await service.getFactCollection(factCollectionKey, makeTips(0, 0), jobId)).toBeUndefined();
  });

  it('rejects a disallowed scope on recordFact', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.recordFact(disallowedCollectionKey, factTypeId, [factPayload], undefined, jobId)).toThrow(
      /not in the allowed scopes/,
    );
  });

  it('rejects a disallowed scope on deleteFactCollection', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.deleteFactCollection(disallowedCollectionKey, jobId)).toThrow(/not in the allowed scopes/);
  });

  it('rejects a disallowed scope on getFactCollection', async () => {
    const service = new FactService(store, [allowedScope]);
    await expect(service.getFactCollection(disallowedCollectionKey, makeTips(0, 0), jobId)).rejects.toThrow(
      /not in the allowed scopes/,
    );
  });

  it('rejects a disallowed scope on getFactCollectionsByType', async () => {
    const service = new FactService(store, [allowedScope]);
    await expect(service.getFactCollectionsByType(disallowedCollectionTypeKey, makeTips(0, 0), jobId)).rejects.toThrow(
      /not in the allowed scopes/,
    );
  });

  it('annotates a retractable fact with its origin block state', async () => {
    const service = new FactService(store, [allowedScope]);
    const blockHash = new Fr(123);
    await service.recordFact(factCollectionKey, factTypeId, [factPayload], { blockNumber: 4, blockHash }, jobId);

    const collection = await service.getFactCollection(factCollectionKey, makeTips(5, 10), jobId);
    expect(collection?.facts).toEqual([
      {
        factTypeId,
        payload: [factPayload],
        originBlock: { blockNumber: 4, blockHash, blockState: OriginBlockState.Finalized },
      },
    ]);
  });
});
