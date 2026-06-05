import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactStore } from './fact_store.js';

describe('FactStore', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const ENTITY = new Fr(7n);
  const RECEIVED = new Fr(1n);
  const PROCESSED = new Fr(2n);
  const corrA = new Fr(0xaan);
  const corrB = new Fr(0xbbn);
  const JOB = 'fact-store-test-job';

  let kv: AztecAsyncKVStore;
  let store: FactStore;

  beforeEach(async () => {
    kv = await openTmpStore('fact-store-test');
    store = new FactStore(kv);
  });
  afterEach(async () => {
    await kv.close();
  });

  it('records facts and loads an entity fact set after commit', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 5, blockHash: new Fr(1n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA);
    const factTypes = facts.map(f => f.factTypeId.toBigInt()).sort();
    expect(factTypes).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()].sort());
  });

  it('dedups identical (entity, factType, payload) records idempotently', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA);
    expect(facts).toHaveLength(1);
  });

  it('enumerates active entities (those with at least one fact) for a scope', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const active = await store.activeEntities(contract, scope, ENTITY);
    expect(active.map(c => c.toBigInt()).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it("terminateEntity deletes all of the entity's facts and drops it from active enumeration", async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 5, blockHash: new Fr(1n) },
      JOB,
    );
    await store.recordFact(contract, scope, ENTITY, corrB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(contract, scope, ENTITY, corrA, TERM);
    await kv.transactionAsync(() => store.commit(TERM));

    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA)).toHaveLength(0);
    const active = await store.activeEntities(contract, scope, ENTITY);
    expect(active.map(c => c.toBigInt())).toEqual([corrB.toBigInt()]);
  });
});
