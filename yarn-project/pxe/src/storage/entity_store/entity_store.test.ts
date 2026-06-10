import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityStore } from './entity_store.js';

describe('EntityStore', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const ENTITY = new Fr(7n);
  const RECEIVED = new Fr(1n);
  const PROCESSED = new Fr(2n);
  const corrA = new Fr(0xaan);
  const corrB = new Fr(0xbbn);
  const JOB = 'fact-store-test-job';

  let kv: AztecAsyncKVStore;
  let store: EntityStore;

  beforeEach(async () => {
    kv = await openTmpStore('fact-store-test');
    store = new EntityStore(kv);
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

  it('enumerates active entities (created and not terminated) for a scope', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [], undefined, JOB);
    await store.createEntity(contract, scope, ENTITY, corrB, [], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const active = await store.activeEntities(contract, scope, ENTITY, JOB);
    expect(active.map(c => c.toBigInt()).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it('lists an entity as active even when it has zero facts', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);
  });

  it("reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);

    // Same job, before commit: the staged entity is active and its fact is visible.
    const facts = await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);

    // A different job does not see the uncommitted write.
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, 'other-job')).toHaveLength(0);
    expect(await store.activeEntities(contract, scope, ENTITY, 'other-job')).toHaveLength(0);
  });

  it('getEntity returns the payload and both facts of an entity with facts', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n), new Fr(6n)], undefined, JOB);
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

    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload.map(f => f.toBigInt())).toEqual([5n, 6n]);
    expect(facts.map(f => f.factTypeId.toBigInt()).sort()).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()].sort());
  });

  it('getEntity returns the payload and empty facts for an entity with zero facts', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts).toHaveLength(0);
  });

  it('getEntity returns an empty payload when no entity record exists', async () => {
    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload).toEqual([]);
    expect(facts).toHaveLength(0);
  });

  it("getEntity reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);

    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect((await store.getEntity(contract, scope, ENTITY, corrA, 'other-job')).payload).toEqual([]);
  });

  it('hides an entity from its own job after a staged terminate, even over committed facts', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A later job stages a terminate; within that job the entity reads as gone, while other jobs still see it
    // committed until the terminate commits.
    const TERM = 'terminate-job';
    await store.terminateEntity(contract, scope, ENTITY, corrA, TERM);

    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, TERM)).toHaveLength(0);
    expect((await store.getEntity(contract, scope, ENTITY, corrA, TERM)).payload).toEqual([]);
    expect(await store.activeEntities(contract, scope, ENTITY, TERM)).toHaveLength(0);
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, 'reader')).toHaveLength(1);
  });

  it('terminateEntity deletes the entity record, all its facts, and drops it from active enumeration', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await store.createEntity(contract, scope, ENTITY, corrB, [], undefined, JOB);
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
    expect((await store.getEntity(contract, scope, ENTITY, corrA, JOB)).payload).toEqual([]);
    const active = await store.activeEntities(contract, scope, ENTITY, JOB);
    expect(active.map(c => c.toBigInt())).toEqual([corrB.toBigInt()]);
    // The neighbouring entity is untouched.
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrB, JOB)).toHaveLength(1);
  });

  it('rollback deletes a retractable entity wholesale (payload + every fact) above the target block', async () => {
    // Retractable entity anchored at block 6, owning one unanchored and one anchored fact.
    await store.createEntity(
      contract,
      scope,
      ENTITY,
      corrA,
      [new Fr(5n)],
      { blockNumber: 6, blockHash: new Fr(1n) },
      JOB,
    );
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 7, blockHash: new Fr(2n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload).toEqual([]);
    expect(facts).toHaveLength(0);
    expect(await store.getEntityFacts(contract, scope, ENTITY, corrA, JOB)).toHaveLength(0);
    expect(await store.activeEntities(contract, scope, ENTITY, JOB)).toHaveLength(0);
  });

  it('rollback keeps a non-retractable entity, pruning only its retractable facts', async () => {
    // Non-retractable entity (no anchor) with one unanchored fact + one anchored fact at block 6.
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(contract, scope, ENTITY, corrA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 6, blockHash: new Fr(1n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]); // Processed pruned, Received kept
    // Entity stays active because the entity record survives.
    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);
  });

  it('rollback above all anchors is a no-op', async () => {
    await store.createEntity(
      contract,
      scope,
      ENTITY,
      corrA,
      [new Fr(5n)],
      { blockNumber: 6, blockHash: new Fr(1n) },
      JOB,
    );
    await store.recordFact(
      contract,
      scope,
      ENTITY,
      corrA,
      PROCESSED,
      [],
      { blockNumber: 7, blockHash: new Fr(2n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(10));

    const { payload, facts } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);
  });

  it('re-creating an entity with a changed anchor clears the stale by-block index', async () => {
    await store.createEntity(
      contract,
      scope,
      ENTITY,
      corrA,
      [new Fr(5n)],
      { blockNumber: 6, blockHash: new Fr(1n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-create the same entity anchored at a different block.
    const JOB2 = 'recreate-job';
    await store.createEntity(
      contract,
      scope,
      ENTITY,
      corrA,
      [new Fr(5n)],
      { blockNumber: 8, blockHash: new Fr(2n) },
      JOB2,
    );
    await kv.transactionAsync(() => store.commit(JOB2));

    // Prune above block 5: the entity (anchored at 8) is deleted exactly once. A stale block-6 index entry would make
    // pass 1 visit it a second time and throw "Entity not found".
    await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
    expect((await store.getEntity(contract, scope, ENTITY, corrA, JOB)).payload).toEqual([]);
    expect(await store.activeEntities(contract, scope, ENTITY, JOB)).toHaveLength(0);
  });

  it('re-creating a retractable entity as non-retractable lets it survive a prune', async () => {
    await store.createEntity(
      contract,
      scope,
      ENTITY,
      corrA,
      [new Fr(5n)],
      { blockNumber: 6, blockHash: new Fr(1n) },
      JOB,
    );
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-create the same entity without an anchor: it is now non-retractable and must survive reorgs.
    const JOB2 = 'recreate-job';
    await store.createEntity(contract, scope, ENTITY, corrA, [new Fr(5n)], undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    await kv.transactionAsync(() => store.rollback(5));

    // Survived: the stale block-6 index entry was cleared when the entity was re-created.
    const { payload } = await store.getEntity(contract, scope, ENTITY, corrA, JOB);
    expect(payload.map(f => f.toBigInt())).toEqual([5n]);
    expect((await store.activeEntities(contract, scope, ENTITY, JOB)).map(c => c.toBigInt())).toEqual([
      corrA.toBigInt(),
    ]);
  });

  it('rollback throws while a job has staged writes', async () => {
    await store.createEntity(contract, scope, ENTITY, corrA, [], undefined, 'uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
      'PXE entity store rollback is not allowed while jobs are running',
    );
    await store.discardStaged('uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
  });
});
