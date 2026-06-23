import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactService } from './fact_service.js';
import { FactStore } from './fact_store.js';
import { FactCollectionKey, FactCollectionTypeKey } from './fact_store_keys.js';

describe('FactService', () => {
  let kv: AztecAsyncKVStore;
  let store: FactStore;

  const jobId = 'job-1';
  const contract = AztecAddress.fromField(new Fr(1));
  const allowedScope = AztecAddress.fromField(new Fr(2));
  const disallowedScope = AztecAddress.fromField(new Fr(3));
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

    const collection = await service.getFactCollection(factCollectionKey, jobId);
    expect(collection?.facts).toEqual([{ factTypeId, payload: [factPayload], originBlock: undefined }]);
  });

  it('delegates getFactCollectionsByType for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(factCollectionKey, factTypeId, [factPayload], undefined, jobId);

    const collections = await service.getFactCollectionsByType(factCollectionTypeKey, jobId);
    expect(collections).toEqual([
      { key: factCollectionKey, facts: [{ factTypeId, payload: [factPayload], originBlock: undefined }] },
    ]);
  });

  it('delegates deleteFactCollection for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(factCollectionKey, factTypeId, [factPayload], undefined, jobId);
    await service.deleteFactCollection(factCollectionKey, jobId);

    expect(await service.getFactCollection(factCollectionKey, jobId)).toBeUndefined();
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

  it('rejects a disallowed scope on getFactCollection', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.getFactCollection(disallowedCollectionKey, jobId)).toThrow(/not in the allowed scopes/);
  });

  it('rejects a disallowed scope on getFactCollectionsByType', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.getFactCollectionsByType(disallowedCollectionTypeKey, jobId)).toThrow(
      /not in the allowed scopes/,
    );
  });
});
