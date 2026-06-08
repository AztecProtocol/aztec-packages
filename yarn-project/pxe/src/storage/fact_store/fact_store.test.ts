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

    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB);
    const factTypes = facts.map(f => f.factTypeId.toBigInt()).sort();
    expect(factTypes).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()].sort());
  });

  it('dedups identical (entity, factType, payload) records idempotently', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB);
    expect(facts).toHaveLength(1);
  });

  it('enumerates active entities (those with at least one fact) for a scope', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const active = await store.activeEntities(contract, scope, ENTITY, JOB);
    expect(active.map(c => c.toBigInt()).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it("reflects a job's own staged record before commit (read-your-writes)", async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);

    // Same job, before commit: the staged Received fact is visible and the entity is active.
    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);

    // A different job does not see the uncommitted write.
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, 'other-job')).toHaveLength(0);
    expect(await store.activeEntities(contract, scope, ENTITY, 'other-job')).toHaveLength(0);
  });

  it('hides an entity from its own job after a staged terminate, even over committed facts', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A later job stages a terminate; within that job the entity reads as gone, while other jobs still see it
    // committed until the terminate commits.
    const TERM = 'terminate-job';
    await store.terminateEntity(contract, scope, ENTITY, corrA, TERM);

    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, TERM)).toHaveLength(0);
    expect(await store.activeEntities(contract, scope, ENTITY, TERM)).toHaveLength(0);
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, 'reader')).toHaveLength(1);
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

    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB)).toHaveLength(0);
    const active = await store.activeEntities(contract, scope, ENTITY, JOB);
    expect(active.map(c => c.toBigInt())).toEqual([corrB.toBigInt()]);
    // The neighbouring entity is untouched.
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrB, JOB)).toHaveLength(1);
  });

  it('rollback deletes only retractable facts above the target block, keeping unanchored facts', async () => {
    // Received (unanchored) + Processed@block 10.
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 10, blockHash: new Fr(1n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]); // Processed pruned, Received kept
    // Entity is still active because its unanchored Received survives.
    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);
  });

  it('rollback removes an entity from active enumeration when its last (anchored) fact is pruned', async () => {
    // Only an anchored fact, no unanchored survivor.
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 10, blockHash: new Fr(1n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB)).toHaveLength(0);
    expect(await store.activeEntities(contract, scope, ENTITY, JOB)).toHaveLength(0);
  });

  it('rollback throws while a job has staged writes', async () => {
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, 'uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
      'PXE fact store rollback is not allowed while jobs are running',
    );
    await store.discardStaged('uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
  });
});
