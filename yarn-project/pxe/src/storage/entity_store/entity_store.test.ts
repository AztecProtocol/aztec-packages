import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { entityKeyStrOf, scopeKeyStrOf } from './entity_keys.js';
import { EntityStore } from './entity_store.js';

describe('EntityStore', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const ENTITY = new Fr(7n);
  const RECEIVED = new Fr(1n);
  const PROCESSED = new Fr(2n);
  const corrA = new Fr(0xaan);
  const corrB = new Fr(0xbbn);
  const keyA = { contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrA };
  const keyB = { contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrB };
  const scopeKey = { contractAddress: contract, scope, entityTypeId: ENTITY };
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

  const entityIdsOf = (entities: { entity: { entityId: Fr } }[]) => entities.map(e => e.entity.entityId.toBigInt());

  it('records facts and loads an entity fact set after commit', async () => {
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('returns facts in creation order', async () => {
    // Payload values chosen so that creation order differs from the dedup row key (payload hash) order.
    const payloads = [9n, 3n, 7n, 1n, 8n, 2n, 6n, 4n];
    for (const value of payloads.slice(0, 5)) {
      await store.recordFact(keyA, RECEIVED, [new Fr(value)], undefined, JOB);
    }
    await kv.transactionAsync(() => store.commit(JOB));

    // Later facts, committed by a second job, follow the earlier ones.
    const JOB2 = 'later-job';
    for (const value of payloads.slice(5)) {
      await store.recordFact(keyA, RECEIVED, [new Fr(value)], undefined, JOB2);
    }
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual(payloads);
  });

  it('staged facts follow committed facts in creation order (read-your-writes)', async () => {
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(3n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'staged-job';
    await store.recordFact(keyA, RECEIVED, [new Fr(7n)], undefined, JOB2);
    await store.recordFact(keyA, RECEIVED, [new Fr(1n)], undefined, JOB2);

    const { facts } = await store.getEntity(keyA, JOB2);
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n, 7n, 1n]);
  });

  it('dedups identical (entity, factType, payload) records idempotently', async () => {
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts).toHaveLength(1);
  });

  it('re-recording a fact is a no-op keeping its creation position and origin block', async () => {
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(1n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'rerecord-job';
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 1n]);
    expect(facts[0].originBlock).toBeUndefined();
  });

  it('re-recording a fact keeps its original origin block (first write wins)', async () => {
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-record the identical fact at a later block: a no-op, so the fact still originates at block 5.
    const JOB2 = 'rerecord-job';
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 10, blockHash: new Fr(2n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    // Prune above block 7: the fact was first derived at block 5, which survives, so the fact must survive.
    await kv.transactionAsync(() => store.rollback(7));
    expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(1);

    // Prune above block 4: the fact originates above the target and is deleted exactly once.
    await kv.transactionAsync(() => store.rollback(4));
    expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(0);
  });

  it('enumerates active entities (created and not terminated) for a scope', async () => {
    await store.createEntity(keyA, [], undefined, JOB);
    await store.createEntity(keyB, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(scopeKey, JOB);
    expect(entityIdsOf(entities).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it('getEntities returns each entity complete with body and facts in creation order', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [new Fr(3n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(scopeKey, JOB);
    expect(entities).toHaveLength(1);
    expect(entities[0].entity.body.map(f => f.toBigInt())).toEqual([5n]);
    expect(entities[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('lists an entity as active even when it has zero facts', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(scopeKey, JOB);
    expect(entityIdsOf(entities)).toEqual([corrA.toBigInt()]);
    expect(entities[0].facts).toHaveLength(0);
  });

  it('creating the same entity twice keeps the first body and lists it once', async () => {
    await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
    await store.createEntity(keyA, [new Fr(2n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    expect((await store.getEntity(keyA, JOB)).body.map(f => f.toBigInt())).toEqual([1n]);
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);

    // Re-creating in a later commit is a no-op too, and still lists the entity exactly once.
    const JOB2 = 'recreate-job';
    await store.createEntity(keyA, [new Fr(3n)], undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    expect((await store.getEntity(keyA, JOB)).body.map(f => f.toBigInt())).toEqual([1n]);
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('re-creating an entity is a no-op keeping its body and facts', async () => {
    await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'recreate-job';
    await store.createEntity(keyA, [new Fr(2n)], undefined, JOB2);

    // Both before and after commit, the original body is paired with the existing facts.
    const staged = await store.getEntities(scopeKey, JOB2);
    expect(staged[0].entity.body.map(f => f.toBigInt())).toEqual([1n]);
    expect(staged[0].facts).toHaveLength(1);

    await kv.transactionAsync(() => store.commit(JOB2));
    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([1n]);
    expect(facts).toHaveLength(1);
  });

  it("reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);

    // Same job, before commit: the staged entity is active and its fact is visible.
    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect((await store.getEntity(keyA, 'other-job')).facts).toHaveLength(0);
    expect(await store.getEntities(scopeKey, 'other-job')).toHaveLength(0);
  });

  it('getEntity returns the body and both facts of an entity with facts', async () => {
    await store.createEntity(keyA, [new Fr(5n), new Fr(6n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n, 6n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('getEntity returns the body and empty facts for an entity with zero facts', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts).toHaveLength(0);
  });

  it('getEntity returns an empty body when no entity record exists', async () => {
    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body).toEqual([]);
    expect(facts).toHaveLength(0);
  });

  it("getEntity reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect((await store.getEntity(keyA, 'other-job')).body).toEqual([]);
  });

  it('hides an entity from its own job after a staged terminate, even over committed facts', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A later job stages a terminate; within that job the entity reads as gone, while other jobs still see it
    // committed until the terminate commits.
    const TERM = 'terminate-job';
    await store.terminateEntity(keyA, TERM);

    expect((await store.getEntity(keyA, TERM)).facts).toHaveLength(0);
    expect((await store.getEntity(keyA, TERM)).body).toEqual([]);
    expect(await store.getEntities(scopeKey, TERM)).toHaveLength(0);
    expect((await store.getEntity(keyA, 'reader')).facts).toHaveLength(1);
  });

  it('terminateEntity deletes the entity record, all its facts, and drops it from active enumeration', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.createEntity(keyB, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(keyB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(keyA, TERM);
    await kv.transactionAsync(() => store.commit(TERM));

    expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(0);
    expect((await store.getEntity(keyA, JOB)).body).toEqual([]);
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrB.toBigInt()]);
    // The neighbouring entity is untouched.
    expect((await store.getEntity(keyB, JOB)).facts).toHaveLength(1);
  });

  it('rollback deletes a retractable entity wholesale (body + every fact) above the target block', async () => {
    // Retractable entity originating at block 6, owning one fact without an origin block and one with.
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body).toEqual([]);
    expect(facts).toHaveLength(0);
    expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);
  });

  it('rollback keeps a non-retractable entity, pruning only its retractable facts', async () => {
    // Non-retractable entity (no origin block) with a non-retractable fact + a fact originating at block 6.
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]); // Processed pruned, Received kept
    // Entity stays active because the entity record survives.
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('rollback above all origin blocks is a no-op', async () => {
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(10));

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('re-creating an entity keeps its original origin block (first write wins)', async () => {
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-creating at a later block is a no-op, so the entity still originates at block 6.
    const JOB2 = 'recreate-job';
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 8, blockHash: new Fr(2n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    // Prune above block 7: the entity was first derived at block 6, which survives, so the entity must survive.
    await kv.transactionAsync(() => store.rollback(7));
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);

    // Prune above block 5: the entity originates above the target and is deleted exactly once.
    await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
    expect((await store.getEntity(keyA, JOB)).body).toEqual([]);
    expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);
  });

  it('replacing an entity requires an explicit terminate-then-create', async () => {
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A plain re-create as non-retractable is a no-op; terminate-then-create replaces the entity for real.
    const JOB2 = 'replace-job';
    await store.terminateEntity(keyA, JOB2);
    await store.createEntity(keyA, [new Fr(7n)], undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    await kv.transactionAsync(() => store.rollback(5));

    // Survived: the replacement entity is non-retractable.
    const { body } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([7n]);
    expect(entityIdsOf(await store.getEntities(scopeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('rollback throws while a job has staged writes', async () => {
    await store.createEntity(keyA, [], undefined, 'uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
      'PXE entity store rollback is not allowed while jobs are running',
    );
    await store.discardStaged('uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
  });

  describe('staged op ordering', () => {
    it('a terminate-then-create sequence resolves to the re-created entity', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'replace-job';
      await store.terminateEntity(keyA, JOB2);
      await store.createEntity(keyA, [new Fr(2n)], undefined, JOB2);

      // Staged view: the re-created entity, with the terminate having wiped the committed fact.
      const staged = await store.getEntity(keyA, JOB2);
      expect(staged.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(staged.facts).toHaveLength(0);
      const stagedEntities = await store.getEntities(scopeKey, JOB2);
      expect(stagedEntities).toHaveLength(1);
      expect(stagedEntities[0].entity.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(stagedEntities[0].facts).toHaveLength(0);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntity(keyA, 'reader');
      expect(committed.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(committed.facts).toHaveLength(0);
    });

    it('a terminate-then-record sequence resolves to the re-recorded fact', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'rerecord-job';
      await store.terminateEntity(keyA, JOB2);
      await store.recordFact(keyA, PROCESSED, [new Fr(3n)], undefined, JOB2);

      // Staged view: only the re-recorded fact survives the terminate; the entity record is gone.
      const staged = await store.getEntity(keyA, JOB2);
      expect(staged.body).toEqual([]);
      expect(staged.facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntity(keyA, 'reader');
      expect(committed.body).toEqual([]);
      expect(committed.facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
      expect(await store.getEntities(scopeKey, 'reader')).toHaveLength(0);
    });

    it('a create-then-terminate sequence leaves the entity deleted', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.terminateEntity(keyA, JOB);

      // Staged view: gone.
      expect((await store.getEntity(keyA, JOB)).body).toEqual([]);
      expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(0);
      expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);

      // Committed view: gone too, and no index residue blocks a later rollback.
      await kv.transactionAsync(() => store.commit(JOB));
      expect((await store.getEntity(keyA, 'reader')).body).toEqual([]);
      expect(await store.getEntities(scopeKey, 'reader')).toHaveLength(0);
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('a fact staged before its entity is created in the same job surfaces with the entity', async () => {
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);

      // Staged view and committed view must agree: the entity is active and owns the fact.
      const staged = await store.getEntities(scopeKey, JOB);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);

      await kv.transactionAsync(() => store.commit(JOB));
      const committed = await store.getEntities(scopeKey, 'reader');
      expect(committed).toHaveLength(1);
      expect(committed[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's ops", async () => {
      const JOB2 = 'second-job';
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(1n)], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only job 1's fact is committed; job 2 still layers its staged fact on top.
      expect((await store.getEntity(keyA, 'reader')).facts.map(f => f.payload[0].toBigInt())).toEqual([9n]);
      expect((await store.getEntity(keyA, JOB2)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 1n]);

      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(keyA, 'reader')).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 1n]);
    });

    it('read-only access with a fresh job id does not block rollback', async () => {
      await store.getEntity(keyA, 'reader-job');
      await store.getEntities(scopeKey, 'reader-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.createEntity(keyA, [new Fr(2n)], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB2);
      await store.discardStaged(JOB2);

      // The discarded writes are gone from the job's own view, and committing the job persists nothing.
      expect((await store.getEntity(keyA, JOB2)).body.map(f => f.toBigInt())).toEqual([1n]);
      await kv.transactionAsync(() => store.commit(JOB2));
      const { body, facts } = await store.getEntity(keyA, 'reader');
      expect(body.map(f => f.toBigInt())).toEqual([1n]);
      expect(facts).toHaveLength(0);
    });
  });

  describe('isolation', () => {
    it('entities under different scopes are isolated', async () => {
      const scope2 = AztecAddress.fromBigInt(2n);
      const keyScope2 = { ...keyA, scope: scope2 };
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.createEntity(keyScope2, [new Fr(2n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Same contract, type and entity id, but each scope only sees its own entity.
      expect((await store.getEntity(keyA, JOB)).body.map(f => f.toBigInt())).toEqual([1n]);
      expect((await store.getEntity(keyScope2, JOB)).body.map(f => f.toBigInt())).toEqual([2n]);
      expect((await store.getEntity(keyScope2, JOB)).facts).toHaveLength(0);
      expect(await store.getEntities({ ...scopeKey, scope: scope2 }, JOB)).toHaveLength(1);

      // Terminating in one scope leaves the other untouched.
      const TERM = 'terminate-job';
      await store.terminateEntity(keyA, TERM);
      await kv.transactionAsync(() => store.commit(TERM));
      expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);
      expect(await store.getEntities({ ...scopeKey, scope: scope2 }, JOB)).toHaveLength(1);
    });

    it('entities under different contracts and entity types are isolated', async () => {
      const contract2 = AztecAddress.fromBigInt(200n);
      const ENTITY2 = new Fr(8n);
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.createEntity({ ...keyA, contractAddress: contract2 }, [new Fr(2n)], undefined, JOB);
      await store.createEntity({ ...keyA, entityTypeId: ENTITY2 }, [new Fr(3n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const inScope = await store.getEntities(scopeKey, JOB);
      expect(inScope).toHaveLength(1);
      expect(inScope[0].entity.body.map(f => f.toBigInt())).toEqual([1n]);
      expect(await store.getEntities({ ...scopeKey, contractAddress: contract2 }, JOB)).toHaveLength(1);
      expect(await store.getEntities({ ...scopeKey, entityTypeId: ENTITY2 }, JOB)).toHaveLength(1);
    });
  });

  describe('creation order', () => {
    it('per-entity creation order is preserved when recording interleaves entities', async () => {
      await store.createEntity(keyA, [], undefined, JOB);
      await store.createEntity(keyB, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(keyB, RECEIVED, [new Fr(8n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(3n)], undefined, JOB);
      await store.recordFact(keyB, RECEIVED, [new Fr(2n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getEntity(keyA, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n]);
      expect((await store.getEntity(keyB, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([8n, 2n]);
      // getEntities returns the same per-entity order.
      const entities = await store.getEntities(scopeKey, JOB);
      const byId = new Map(entities.map(e => [e.entity.entityId.toBigInt(), e.facts]));
      expect(byId.get(corrA.toBigInt())!.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n]);
      expect(byId.get(corrB.toBigInt())!.map(f => f.payload[0].toBigInt())).toEqual([8n, 2n]);
    });

    it('creation order is preserved after a prune removes facts from the middle', async () => {
      await store.createEntity(keyA, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(3n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(7n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      expect((await store.getEntity(keyA, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 7n]);
    });

    it('facts re-recorded after a terminate take fresh creation positions', async () => {
      await store.createEntity(keyA, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(1n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Terminate wipes the facts; re-recording them in reverse order is a new creation order.
      const JOB2 = 'replay-job';
      await store.terminateEntity(keyA, JOB2);
      await store.createEntity(keyA, [], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [new Fr(1n)], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB2));

      expect((await store.getEntity(keyA, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([1n, 9n]);
    });

    it('creation order continues across store reopens', async () => {
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(3n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // A fresh EntityStore over the same kv store continues the persisted sequence instead of restarting it.
      const reopened = new EntityStore(kv);
      const JOB2 = 'reopened-job';
      await reopened.recordFact(keyA, RECEIVED, [new Fr(7n)], undefined, JOB2);
      await reopened.recordFact(keyA, RECEIVED, [new Fr(1n)], undefined, JOB2);
      await kv.transactionAsync(() => reopened.commit(JOB2));

      expect((await reopened.getEntity(keyA, JOB2)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n, 7n, 1n]);
    });
  });

  describe('rollback boundaries and index hygiene', () => {
    it('records originating exactly at the target block survive a rollback', async () => {
      await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only records strictly above the target block are pruned.
      await kv.transactionAsync(() => store.rollback(5));
      const { body, facts } = await store.getEntity(keyA, JOB);
      expect(body.map(f => f.toBigInt())).toEqual([5n]);
      expect(facts).toHaveLength(1);

      await kv.transactionAsync(() => store.rollback(4));
      expect((await store.getEntity(keyA, JOB)).body).toEqual([]);
      expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(0);
    });

    it('pruning an entity clears the by-block entries of facts below the prune point', async () => {
      // Entity originating at block 6 owning a fact originating at block 4: pruning above 5 deletes the entity
      // wholesale, including the block-4 fact and its index entry.
      await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 4, blockHash: new Fr(2n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(0);

      // A dangling block-4 fact index entry would make this second prune throw "Fact not found".
      await expect(kv.transactionAsync(() => store.rollback(3))).resolves.not.toThrow();
    });

    it('rollback is idempotent', async () => {
      await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
      expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);
    });
  });

  describe('facts without an entity record', () => {
    it('a committed fact does not activate an entity; creating it later surfaces the fact', async () => {
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // The fact is stored and readable, but the entity is not active.
      expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(1);
      expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);

      // Creating the entity in a later job surfaces the previously committed fact, both staged and committed.
      const JOB2 = 'create-job';
      await store.createEntity(keyA, [new Fr(5n)], undefined, JOB2);
      const staged = await store.getEntities(scopeKey, JOB2);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts).toHaveLength(1);

      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntities(scopeKey, JOB);
      expect(committed).toHaveLength(1);
      expect(committed[0].facts).toHaveLength(1);
    });

    it('a staged fact for an unknown entity does not activate it', async () => {
      await store.recordFact(keyB, RECEIVED, [new Fr(8n)], undefined, JOB);
      expect(await store.getEntities(scopeKey, JOB)).toHaveLength(0);
    });
  });

  describe('index corruption detection', () => {
    it('getEntities fails loudly when the scope index references a missing entity', async () => {
      await kv
        .openMultiMap<string, string>('entities_by_scope')
        .set(scopeKeyStrOf(scopeKey), new Fr(0xdeadn).toString());
      await expect(store.getEntities(scopeKey, JOB)).rejects.toThrow('Entity not found for entityKey');
    });

    it('getEntity fails loudly when the fact index references a missing row', async () => {
      await kv.openMultiMap<string, string>('facts_by_entity').set(entityKeyStrOf(keyA), 'bogus-fact-key');
      await expect(store.getEntity(keyA, JOB)).rejects.toThrow('Fact not found for factKey bogus-fact-key');
    });

    it('rollback fails loudly when the entity by-block index references a missing entity', async () => {
      await kv
        .openMultiMap<number, string>('entities_by_block')
        .set(7, entityKeyStrOf({ ...keyA, entityId: new Fr(0xdeadn) }));
      await expect(kv.transactionAsync(() => store.rollback(5))).rejects.toThrow('Entity not found for entityKey');
    });

    it('rollback fails loudly when the fact by-block index references a missing row', async () => {
      await kv.openMultiMap<number, string>('facts_by_block').set(7, 'bogus-fact-key');
      await expect(kv.transactionAsync(() => store.rollback(5))).rejects.toThrow(
        'Fact not found for factKey bogus-fact-key',
      );
    });
  });
});
