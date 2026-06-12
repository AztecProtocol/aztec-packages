import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { entityKeyOf, scopeKeyOf } from './entity_keys.js';
import { EntityStore } from './entity_store.js';

describe('EntityStore', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const ENTITY = new Fr(7n);
  const RECEIVED = new Fr(1n);
  const PROCESSED = new Fr(2n);
  const corrA = new Fr(0xaan);
  const corrB = new Fr(0xbbn);
  const coordsA = { contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrA };
  const coordsB = { contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrB };
  const scopeCoords = { contractAddress: contract, scope, entityTypeId: ENTITY };
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
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = await store.getEntity(coordsA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('returns facts in creation order', async () => {
    // Payload values chosen so that creation order differs from the dedup row key (payload hash) order.
    const payloads = [9n, 3n, 7n, 1n, 8n, 2n, 6n, 4n];
    for (const value of payloads.slice(0, 5)) {
      await store.recordFact(coordsA, RECEIVED, [new Fr(value)], undefined, JOB);
    }
    await kv.transactionAsync(() => store.commit(JOB));

    // Later facts, committed by a second job, follow the earlier ones.
    const JOB2 = 'later-job';
    for (const value of payloads.slice(5)) {
      await store.recordFact(coordsA, RECEIVED, [new Fr(value)], undefined, JOB2);
    }
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = await store.getEntity(coordsA, JOB);
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual(payloads);
  });

  it('staged facts follow committed facts in creation order (read-your-writes)', async () => {
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(3n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'staged-job';
    await store.recordFact(coordsA, RECEIVED, [new Fr(7n)], undefined, JOB2);
    await store.recordFact(coordsA, RECEIVED, [new Fr(1n)], undefined, JOB2);

    const { facts } = await store.getEntity(coordsA, JOB2);
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n, 7n, 1n]);
  });

  it('dedups identical (entity, factType, payload) records idempotently', async () => {
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = await store.getEntity(coordsA, JOB);
    expect(facts).toHaveLength(1);
  });

  it('re-recording a fact keeps its creation position', async () => {
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(1n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'rerecord-job';
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = await store.getEntity(coordsA, JOB);
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 1n]);
    expect(facts[0].originBlock?.blockNumber).toBe(5);
  });

  it('re-recording a fact with a changed origin block updates its retraction block', async () => {
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], { blockNumber: 10, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-record the identical fact originating at an earlier block: same dedup row, new origin.
    const JOB2 = 'rerecord-job';
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(2n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    // Prune above block 7: the fact now originates at block 5 and must survive. A stale block-10 index entry would
    // make pass 2 delete it.
    await kv.transactionAsync(() => store.rollback(7));
    expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(1);

    // Prune above block 4: the fact originates above the target and is deleted exactly once.
    await kv.transactionAsync(() => store.rollback(4));
    expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(0);
  });

  it('enumerates active entities (created and not terminated) for a scope', async () => {
    await store.createEntity(coordsA, [], undefined, JOB);
    await store.createEntity(coordsB, [], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(scopeCoords, JOB);
    expect(entityIdsOf(entities).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it('getEntities returns each entity complete with body and facts in creation order', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, PROCESSED, [new Fr(3n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(scopeCoords, JOB);
    expect(entities).toHaveLength(1);
    expect(entities[0].entity.body.map(f => f.toBigInt())).toEqual([5n]);
    expect(entities[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('lists an entity as active even when it has zero facts', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(scopeCoords, JOB);
    expect(entityIdsOf(entities)).toEqual([corrA.toBigInt()]);
    expect(entities[0].facts).toHaveLength(0);
  });

  it('creating the same entity twice keeps the last body and lists it once', async () => {
    await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
    await store.createEntity(coordsA, [new Fr(2n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    expect((await store.getEntity(coordsA, JOB)).body.map(f => f.toBigInt())).toEqual([2n]);
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrA.toBigInt()]);

    // Re-creating in a later commit overwrites again and still lists the entity exactly once.
    const JOB2 = 'recreate-job';
    await store.createEntity(coordsA, [new Fr(3n)], undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    expect((await store.getEntity(coordsA, JOB)).body.map(f => f.toBigInt())).toEqual([3n]);
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('re-creating an entity keeps the facts it already owns', async () => {
    await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'recreate-job';
    await store.createEntity(coordsA, [new Fr(2n)], undefined, JOB2);

    // Both before and after commit, the new body is paired with the existing facts.
    const staged = await store.getEntities(scopeCoords, JOB2);
    expect(staged[0].entity.body.map(f => f.toBigInt())).toEqual([2n]);
    expect(staged[0].facts).toHaveLength(1);

    await kv.transactionAsync(() => store.commit(JOB2));
    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([2n]);
    expect(facts).toHaveLength(1);
  });

  it("reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);

    // Same job, before commit: the staged entity is active and its fact is visible.
    const { facts } = await store.getEntity(coordsA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrA.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect((await store.getEntity(coordsA, 'other-job')).facts).toHaveLength(0);
    expect(await store.getEntities(scopeCoords, 'other-job')).toHaveLength(0);
  });

  it('getEntity returns the body and both facts of an entity with facts', async () => {
    await store.createEntity(coordsA, [new Fr(5n), new Fr(6n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n, 6n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('getEntity returns the body and empty facts for an entity with zero facts', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts).toHaveLength(0);
  });

  it('getEntity returns an empty body when no entity record exists', async () => {
    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body).toEqual([]);
    expect(facts).toHaveLength(0);
  });

  it("getEntity reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);

    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect((await store.getEntity(coordsA, 'other-job')).body).toEqual([]);
  });

  it('hides an entity from its own job after a staged terminate, even over committed facts', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A later job stages a terminate; within that job the entity reads as gone, while other jobs still see it
    // committed until the terminate commits.
    const TERM = 'terminate-job';
    await store.terminateEntity(coordsA, TERM);

    expect((await store.getEntity(coordsA, TERM)).facts).toHaveLength(0);
    expect((await store.getEntity(coordsA, TERM)).body).toEqual([]);
    expect(await store.getEntities(scopeCoords, TERM)).toHaveLength(0);
    expect((await store.getEntity(coordsA, 'reader')).facts).toHaveLength(1);
  });

  it('terminateEntity deletes the entity record, all its facts, and drops it from active enumeration', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await store.createEntity(coordsB, [], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(coordsB, RECEIVED, [new Fr(8n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(coordsA, TERM);
    await kv.transactionAsync(() => store.commit(TERM));

    expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(0);
    expect((await store.getEntity(coordsA, JOB)).body).toEqual([]);
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrB.toBigInt()]);
    // The neighbouring entity is untouched.
    expect((await store.getEntity(coordsB, JOB)).facts).toHaveLength(1);
  });

  it('rollback deletes a retractable entity wholesale (body + every fact) above the target block', async () => {
    // Retractable entity originating at block 6, owning one fact without an origin block and one with.
    await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, PROCESSED, [], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body).toEqual([]);
    expect(facts).toHaveLength(0);
    expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);
  });

  it('rollback keeps a non-retractable entity, pruning only its retractable facts', async () => {
    // Non-retractable entity (no origin block) with a non-retractable fact + a fact originating at block 6.
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(coordsA, PROCESSED, [], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]); // Processed pruned, Received kept
    // Entity stays active because the entity record survives.
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('rollback above all origin blocks is a no-op', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(coordsA, PROCESSED, [], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(10));

    const { body, facts } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('re-creating an entity with a changed origin block clears the stale by-block index', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-create the same entity originating at a different block.
    const JOB2 = 'recreate-job';
    await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 8, blockHash: new Fr(2n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    // Prune above block 5: the entity (origin block 8) is deleted exactly once. A stale block-6 index entry would make
    // pass 1 visit it a second time and throw "Entity not found".
    await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
    expect((await store.getEntity(coordsA, JOB)).body).toEqual([]);
    expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);
  });

  it('re-creating a retractable entity as non-retractable lets it survive a prune', async () => {
    await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-create the same entity without an origin block: it is now non-retractable and must survive reorgs.
    const JOB2 = 'recreate-job';
    await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    await kv.transactionAsync(() => store.rollback(5));

    // Survived: the stale block-6 index entry was cleared when the entity was re-created.
    const { body } = await store.getEntity(coordsA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(entityIdsOf(await store.getEntities(scopeCoords, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('rollback throws while a job has staged writes', async () => {
    await store.createEntity(coordsA, [], undefined, 'uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
      'PXE entity store rollback is not allowed while jobs are running',
    );
    await store.discardStaged('uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
  });

  describe('staged op ordering', () => {
    it('a terminate-then-create sequence resolves to the re-created entity', async () => {
      await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'replace-job';
      await store.terminateEntity(coordsA, JOB2);
      await store.createEntity(coordsA, [new Fr(2n)], undefined, JOB2);

      // Staged view: the re-created entity, with the terminate having wiped the committed fact.
      const staged = await store.getEntity(coordsA, JOB2);
      expect(staged.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(staged.facts).toHaveLength(0);
      const stagedEntities = await store.getEntities(scopeCoords, JOB2);
      expect(stagedEntities).toHaveLength(1);
      expect(stagedEntities[0].entity.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(stagedEntities[0].facts).toHaveLength(0);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntity(coordsA, 'reader');
      expect(committed.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(committed.facts).toHaveLength(0);
    });

    it('a terminate-then-record sequence resolves to the re-recorded fact', async () => {
      await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'rerecord-job';
      await store.terminateEntity(coordsA, JOB2);
      await store.recordFact(coordsA, PROCESSED, [new Fr(3n)], undefined, JOB2);

      // Staged view: only the re-recorded fact survives the terminate; the entity record is gone.
      const staged = await store.getEntity(coordsA, JOB2);
      expect(staged.body).toEqual([]);
      expect(staged.facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntity(coordsA, 'reader');
      expect(committed.body).toEqual([]);
      expect(committed.facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
      expect(await store.getEntities(scopeCoords, 'reader')).toHaveLength(0);
    });

    it('a create-then-terminate sequence leaves the entity deleted', async () => {
      await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.terminateEntity(coordsA, JOB);

      // Staged view: gone.
      expect((await store.getEntity(coordsA, JOB)).body).toEqual([]);
      expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(0);
      expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);

      // Committed view: gone too, and no index residue blocks a later rollback.
      await kv.transactionAsync(() => store.commit(JOB));
      expect((await store.getEntity(coordsA, 'reader')).body).toEqual([]);
      expect(await store.getEntities(scopeCoords, 'reader')).toHaveLength(0);
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('a fact staged before its entity is created in the same job surfaces with the entity', async () => {
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB);

      // Staged view and committed view must agree: the entity is active and owns the fact.
      const staged = await store.getEntities(scopeCoords, JOB);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);

      await kv.transactionAsync(() => store.commit(JOB));
      const committed = await store.getEntities(scopeCoords, 'reader');
      expect(committed).toHaveLength(1);
      expect(committed[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's ops", async () => {
      const JOB2 = 'second-job';
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(1n)], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only job 1's fact is committed; job 2 still layers its staged fact on top.
      expect((await store.getEntity(coordsA, 'reader')).facts.map(f => f.payload[0].toBigInt())).toEqual([9n]);
      expect((await store.getEntity(coordsA, JOB2)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 1n]);

      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(coordsA, 'reader')).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 1n]);
    });

    it('read-only access with a fresh job id does not block rollback', async () => {
      await store.getEntity(coordsA, 'reader-job');
      await store.getEntities(scopeCoords, 'reader-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.createEntity(coordsA, [new Fr(2n)], undefined, JOB2);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB2);
      await store.discardStaged(JOB2);

      // The discarded writes are gone from the job's own view, and committing the job persists nothing.
      expect((await store.getEntity(coordsA, JOB2)).body.map(f => f.toBigInt())).toEqual([1n]);
      await kv.transactionAsync(() => store.commit(JOB2));
      const { body, facts } = await store.getEntity(coordsA, 'reader');
      expect(body.map(f => f.toBigInt())).toEqual([1n]);
      expect(facts).toHaveLength(0);
    });
  });

  describe('isolation', () => {
    it('entities under different scopes are isolated', async () => {
      const scope2 = AztecAddress.fromBigInt(2n);
      const coordsScope2 = { ...coordsA, scope: scope2 };
      await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.createEntity(coordsScope2, [new Fr(2n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Same contract, type and entity id, but each scope only sees its own entity.
      expect((await store.getEntity(coordsA, JOB)).body.map(f => f.toBigInt())).toEqual([1n]);
      expect((await store.getEntity(coordsScope2, JOB)).body.map(f => f.toBigInt())).toEqual([2n]);
      expect((await store.getEntity(coordsScope2, JOB)).facts).toHaveLength(0);
      expect(await store.getEntities({ ...scopeCoords, scope: scope2 }, JOB)).toHaveLength(1);

      // Terminating in one scope leaves the other untouched.
      const TERM = 'terminate-job';
      await store.terminateEntity(coordsA, TERM);
      await kv.transactionAsync(() => store.commit(TERM));
      expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);
      expect(await store.getEntities({ ...scopeCoords, scope: scope2 }, JOB)).toHaveLength(1);
    });

    it('entities under different contracts and entity types are isolated', async () => {
      const contract2 = AztecAddress.fromBigInt(200n);
      const ENTITY2 = new Fr(8n);
      await store.createEntity(coordsA, [new Fr(1n)], undefined, JOB);
      await store.createEntity({ ...coordsA, contractAddress: contract2 }, [new Fr(2n)], undefined, JOB);
      await store.createEntity({ ...coordsA, entityTypeId: ENTITY2 }, [new Fr(3n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const inScope = await store.getEntities(scopeCoords, JOB);
      expect(inScope).toHaveLength(1);
      expect(inScope[0].entity.body.map(f => f.toBigInt())).toEqual([1n]);
      expect(await store.getEntities({ ...scopeCoords, contractAddress: contract2 }, JOB)).toHaveLength(1);
      expect(await store.getEntities({ ...scopeCoords, entityTypeId: ENTITY2 }, JOB)).toHaveLength(1);
    });
  });

  describe('creation order', () => {
    it('per-entity creation order is preserved when recording interleaves entities', async () => {
      await store.createEntity(coordsA, [], undefined, JOB);
      await store.createEntity(coordsB, [], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(coordsB, RECEIVED, [new Fr(8n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(3n)], undefined, JOB);
      await store.recordFact(coordsB, RECEIVED, [new Fr(2n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getEntity(coordsA, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n]);
      expect((await store.getEntity(coordsB, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([8n, 2n]);
      // getEntities returns the same per-entity order.
      const entities = await store.getEntities(scopeCoords, JOB);
      const byId = new Map(entities.map(e => [e.entity.entityId.toBigInt(), e.facts]));
      expect(byId.get(corrA.toBigInt())!.map(f => f.payload[0].toBigInt())).toEqual([9n, 3n]);
      expect(byId.get(corrB.toBigInt())!.map(f => f.payload[0].toBigInt())).toEqual([8n, 2n]);
    });

    it('creation order is preserved after a prune removes facts from the middle', async () => {
      await store.createEntity(coordsA, [], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(3n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(7n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      expect((await store.getEntity(coordsA, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([9n, 7n]);
    });

    it('facts re-recorded after a terminate take fresh creation positions', async () => {
      await store.createEntity(coordsA, [], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(1n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Terminate wipes the facts; re-recording them in reverse order is a new creation order.
      const JOB2 = 'replay-job';
      await store.terminateEntity(coordsA, JOB2);
      await store.createEntity(coordsA, [], undefined, JOB2);
      await store.recordFact(coordsA, RECEIVED, [new Fr(1n)], undefined, JOB2);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB2));

      expect((await store.getEntity(coordsA, JOB)).facts.map(f => f.payload[0].toBigInt())).toEqual([1n, 9n]);
    });

    it('creation order continues across store reopens', async () => {
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(3n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // A fresh EntityStore over the same kv store continues the persisted sequence instead of restarting it.
      const reopened = new EntityStore(kv);
      const JOB2 = 'reopened-job';
      await reopened.recordFact(coordsA, RECEIVED, [new Fr(7n)], undefined, JOB2);
      await reopened.recordFact(coordsA, RECEIVED, [new Fr(1n)], undefined, JOB2);
      await kv.transactionAsync(() => reopened.commit(JOB2));

      expect((await reopened.getEntity(coordsA, JOB2)).facts.map(f => f.payload[0].toBigInt())).toEqual([
        9n,
        3n,
        7n,
        1n,
      ]);
    });
  });

  describe('rollback boundaries and index hygiene', () => {
    it('records originating exactly at the target block survive a rollback', async () => {
      await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only records strictly above the target block are pruned.
      await kv.transactionAsync(() => store.rollback(5));
      const { body, facts } = await store.getEntity(coordsA, JOB);
      expect(body.map(f => f.toBigInt())).toEqual([5n]);
      expect(facts).toHaveLength(1);

      await kv.transactionAsync(() => store.rollback(4));
      expect((await store.getEntity(coordsA, JOB)).body).toEqual([]);
      expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(0);
    });

    it('pruning an entity clears the by-block entries of facts below the prune point', async () => {
      // Entity originating at block 6 owning a fact originating at block 4: pruning above 5 deletes the entity
      // wholesale, including the block-4 fact and its index entry.
      await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], { blockNumber: 4, blockHash: new Fr(2n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(0);

      // A dangling block-4 fact index entry would make this second prune throw "Fact not found".
      await expect(kv.transactionAsync(() => store.rollback(3))).resolves.not.toThrow();
    });

    it('rollback is idempotent', async () => {
      await store.createEntity(coordsA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
      expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);
    });
  });

  describe('facts without an entity record', () => {
    it('a committed fact does not activate an entity; creating it later surfaces the fact', async () => {
      await store.recordFact(coordsA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // The fact is stored and readable, but the entity is not active.
      expect((await store.getEntity(coordsA, JOB)).facts).toHaveLength(1);
      expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);

      // Creating the entity in a later job surfaces the previously committed fact, both staged and committed.
      const JOB2 = 'create-job';
      await store.createEntity(coordsA, [new Fr(5n)], undefined, JOB2);
      const staged = await store.getEntities(scopeCoords, JOB2);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts).toHaveLength(1);

      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntities(scopeCoords, JOB);
      expect(committed).toHaveLength(1);
      expect(committed[0].facts).toHaveLength(1);
    });

    it('a staged fact for an unknown entity does not activate it', async () => {
      await store.recordFact(coordsB, RECEIVED, [new Fr(8n)], undefined, JOB);
      expect(await store.getEntities(scopeCoords, JOB)).toHaveLength(0);
    });
  });

  describe('index corruption detection', () => {
    it('getEntities fails loudly when the scope index references a missing entity', async () => {
      await kv
        .openMultiMap<string, string>('entities_by_scope')
        .set(scopeKeyOf(scopeCoords), new Fr(0xdeadn).toString());
      await expect(store.getEntities(scopeCoords, JOB)).rejects.toThrow('Entity not found for entityKey');
    });

    it('getEntity fails loudly when the fact index references a missing row', async () => {
      await kv.openMultiMap<string, string>('facts_by_entity').set(entityKeyOf(coordsA), 'bogus-row-key');
      await expect(store.getEntity(coordsA, JOB)).rejects.toThrow('Fact not found for rowKey bogus-row-key');
    });

    it('rollback fails loudly when the entity by-block index references a missing entity', async () => {
      await kv
        .openMultiMap<number, string>('entities_by_block')
        .set(7, entityKeyOf({ ...coordsA, entityId: new Fr(0xdeadn) }));
      await expect(kv.transactionAsync(() => store.rollback(5))).rejects.toThrow('Entity not found for entityKey');
    });

    it('rollback fails loudly when the fact by-block index references a missing row', async () => {
      await kv.openMultiMap<number, string>('facts_by_block').set(7, 'bogus-row-key');
      await expect(kv.transactionAsync(() => store.rollback(5))).rejects.toThrow(
        'Fact not found for rowKey bogus-row-key',
      );
    });
  });
});
