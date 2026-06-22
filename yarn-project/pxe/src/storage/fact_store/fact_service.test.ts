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

  const key = new FactCollectionKey(contract, typeId, collectionId);
  const typeKey = new FactCollectionTypeKey(contract, typeId);

  beforeEach(async () => {
    kv = await openTmpStore('fact-service-test');
    store = new FactStore(kv);
  });

  it('delegates record+get for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(key, factTypeId, [factPayload], undefined, allowedScope, jobId);

    const collection = await service.getFactCollection(key, [allowedScope], jobId);
    expect(collection?.facts).toEqual([{ factTypeId, payload: [factPayload], originBlock: undefined }]);
  });

  it('delegates getFactCollectionsByType for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(key, factTypeId, [factPayload], undefined, allowedScope, jobId);

    const collections = await service.getFactCollectionsByType(typeKey, [allowedScope], jobId);
    expect(collections).toEqual([{ key, facts: [{ factTypeId, payload: [factPayload], originBlock: undefined }] }]);
  });

  it('delegates removeFactCollection (descope) for an allowed scope', async () => {
    const service = new FactService(store, [allowedScope]);
    await service.recordFact(key, factTypeId, [factPayload], undefined, allowedScope, jobId);
    await service.removeFactCollection(key, allowedScope, jobId);

    expect(await service.getFactCollection(key, [allowedScope], jobId)).toBeUndefined();
  });

  it('rejects a disallowed scope on recordFact', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.recordFact(key, factTypeId, [factPayload], undefined, disallowedScope, jobId)).toThrow(
      /not in the allowed scopes/,
    );
  });

  it('rejects a disallowed scope on removeFactCollection', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.removeFactCollection(key, disallowedScope, jobId)).toThrow(/not in the allowed scopes/);
  });

  it('rejects a disallowed scope on getFactCollection', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.getFactCollection(key, [disallowedScope], jobId)).toThrow(/not in the allowed scopes/);
  });

  it('rejects a disallowed scope on getFactCollectionsByType', () => {
    const service = new FactService(store, [allowedScope]);
    expect(() => service.getFactCollectionsByType(typeKey, [disallowedScope], jobId)).toThrow(
      /not in the allowed scopes/,
    );
  });

  it('always allows the zero (global) scope', async () => {
    const service = new FactService(store, []);
    await service.recordFact(key, factTypeId, [factPayload], undefined, AztecAddress.ZERO, jobId);

    const collection = await service.getFactCollection(key, [AztecAddress.ZERO], jobId);
    expect(collection?.facts).toEqual([{ factTypeId, payload: [factPayload], originBlock: undefined }]);
  });
});
