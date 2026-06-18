import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityService } from './entity_service.js';
import { EntityStore } from './entity_store.js';
import { EntityKey, EntityTypeKey } from './entity_store_keys.js';

describe('EntityService', () => {
  let kv: AztecAsyncKVStore;
  let store: EntityStore;

  const jobId = 'job-1';
  const contract = AztecAddress.fromField(new Fr(1));
  const allowedScope = AztecAddress.fromField(new Fr(2));
  const disallowedScope = AztecAddress.fromField(new Fr(3));
  const typeId = new Fr(10);
  const entityId = new Fr(20);
  const factTypeId = new Fr(30);
  const factPayload = new Fr(40);

  const keyFor = (scope: AztecAddress) => new EntityKey(contract, scope, typeId, entityId);
  const typeKeyFor = (scope: AztecAddress) => new EntityTypeKey(contract, scope, typeId);

  beforeEach(async () => {
    kv = await openTmpStore('entity-service-test');
    store = new EntityStore(kv);
  });

  it('delegates create+get for an allowed scope', async () => {
    const service = new EntityService(store, [allowedScope]);
    await service.createEntity(keyFor(allowedScope), [new Fr(99)], undefined, jobId);

    const entity = await service.getEntity(keyFor(allowedScope), jobId);
    expect(entity?.body).toEqual([new Fr(99)]);
  });

  it('delegates recordFact for an allowed scope', async () => {
    const service = new EntityService(store, [allowedScope]);
    await service.createEntity(keyFor(allowedScope), [new Fr(99)], undefined, jobId);
    await service.recordFact(keyFor(allowedScope), factTypeId, [factPayload], undefined, jobId);

    const entity = await service.getEntity(keyFor(allowedScope), jobId);
    expect(entity?.facts).toEqual([{ factTypeId, payload: [factPayload], originBlock: undefined }]);
  });

  it('delegates terminate for an allowed scope', async () => {
    const service = new EntityService(store, [allowedScope]);
    await service.createEntity(keyFor(allowedScope), [new Fr(99)], undefined, jobId);
    await service.terminateEntity(keyFor(allowedScope), jobId);

    expect(await service.getEntity(keyFor(allowedScope), jobId)).toBeUndefined();
  });

  it('rejects a disallowed scope on create', () => {
    const service = new EntityService(store, [allowedScope]);
    expect(() => service.createEntity(keyFor(disallowedScope), [new Fr(99)], undefined, jobId)).toThrow(
      /not in the allowed scopes/,
    );
  });

  it('rejects a disallowed scope on getEntities', () => {
    const service = new EntityService(store, [allowedScope]);
    expect(() => service.getEntities(typeKeyFor(disallowedScope), jobId)).toThrow(/not in the allowed scopes/);
  });

  it('rejects a disallowed scope on recordFact', () => {
    const service = new EntityService(store, [allowedScope]);
    expect(() => service.recordFact(keyFor(disallowedScope), factTypeId, [factPayload], undefined, jobId)).toThrow(
      /not in the allowed scopes/,
    );
  });

  it('rejects a disallowed scope on terminate', () => {
    const service = new EntityService(store, [allowedScope]);
    expect(() => service.terminateEntity(keyFor(disallowedScope), jobId)).toThrow(/not in the allowed scopes/);
  });

  it('always allows the zero (global) scope', async () => {
    const service = new EntityService(store, []);
    await service.createEntity(keyFor(AztecAddress.ZERO), [new Fr(7)], undefined, jobId);

    const entity = await service.getEntity(keyFor(AztecAddress.ZERO), jobId);
    expect(entity?.body).toEqual([new Fr(7)]);
  });
});
