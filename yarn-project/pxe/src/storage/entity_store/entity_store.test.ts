import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityKey, EntityTypeKey } from './entity_keys.js';
import { EntityStore } from './entity_store.js';

describe('EntityStore', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const ENTITY = new Fr(7n);
  const RECEIVED = new Fr(1n);
  const PROCESSED = new Fr(2n);
  const corrA = new Fr(0xaan);
  const corrB = new Fr(0xbbn);
  const keyA = EntityKey.from({ contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrA });
  const keyB = EntityKey.from({ contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrB });
  const entityTypeKey = EntityTypeKey.from({ contractAddress: contract, scope, entityTypeId: ENTITY });
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

  const entityIdsOf = (entities: { key: EntityKey }[]) => entities.map(e => e.key.entityId.toBigInt());

  it('records facts and loads an entity fact set after commit', async () => {
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('returns facts in creation order', async () => {
    // Payload values chosen so that creation order differs from the dedup row key (payload hash) order.
    const payloads = [9n, 3n, 7n, 1n, 8n, 2n, 6n, 4n];
    await store.createEntity(keyA, [], undefined, JOB);
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
    await store.createEntity(keyA, [], undefined, JOB);
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
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts).toHaveLength(1);
  });

  it('re-recording a fact is a no-op keeping its creation position and origin block', async () => {
    await store.createEntity(keyA, [], undefined, JOB);
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
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-record the identical fact at a later block: a no-op, so the fact still originates at block 5.
    const JOB2 = 'rerecord-job';
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 10, blockHash: new Fr(2n) }, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    // Prune above block 7: the fact was first derived at block 5, which survives, so the fact must survive.
    await kv.transactionAsync(() => store.rollback(7));
    expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(1);
    await store.discardStaged(JOB); // reads pin the job; release it so the next rollback isn't blocked

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

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entityIdsOf(entities).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it('getEntities returns each entity complete with body and facts in creation order', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [new Fr(3n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entities).toHaveLength(1);
    expect(entities[0].body.map(f => f.toBigInt())).toEqual([5n]);
    expect(entities[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('lists an entity as active even when it has zero facts', async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entityIdsOf(entities)).toEqual([corrA.toBigInt()]);
    expect(entities[0].facts).toHaveLength(0);
  });

  it('createEntity rejects an entity already staged for creation in the same job', async () => {
    await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
    await expect(store.createEntity(keyA, [new Fr(2n)], undefined, JOB)).rejects.toThrow('already existing entity');
  });

  it('createEntity rejects an entity already committed to disk', async () => {
    await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await expect(store.createEntity(keyA, [new Fr(2n)], undefined, 'recreate-job')).rejects.toThrow(
      'already existing entity',
    );
  });

  it("reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);

    // Same job, before commit: the staged entity is active and its fact is visible.
    const { facts } = await store.getEntity(keyA, JOB);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect((await store.getEntity(keyA, 'other-job')).facts).toHaveLength(0);
    expect(await store.getEntities(entityTypeKey, 'other-job')).toHaveLength(0);
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
    expect(await store.getEntities(entityTypeKey, TERM)).toHaveLength(0);
    expect((await store.getEntity(keyA, 'reader')).facts).toHaveLength(1);
  });

  it('terminateEntity rejects a non-existent entity', async () => {
    await expect(store.terminateEntity(keyA, JOB)).rejects.toThrow('non-existent entity');
  });

  it('terminateEntity rejects an entity already terminated earlier in the same job', async () => {
    await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(keyA, TERM);
    await expect(store.terminateEntity(keyA, TERM)).rejects.toThrow('non-existent entity');
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
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrB.toBigInt()]);
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
    expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
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
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('rollback above all origin blocks is a no-op', async () => {
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(10));

    const { body, facts } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([5n]);
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('replacing an entity requires an explicit terminate-then-create', async () => {
    await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A plain re-create now rejects; terminate-then-create is the supported way to replace the entity.
    const JOB2 = 'replace-job';
    await store.terminateEntity(keyA, JOB2);
    await store.createEntity(keyA, [new Fr(7n)], undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    await kv.transactionAsync(() => store.rollback(5));

    // Survived: the replacement entity is non-retractable.
    const { body } = await store.getEntity(keyA, JOB);
    expect(body.map(f => f.toBigInt())).toEqual([7n]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);
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
      const stagedEntities = await store.getEntities(entityTypeKey, JOB2);
      expect(stagedEntities).toHaveLength(1);
      expect(stagedEntities[0].body.map(f => f.toBigInt())).toEqual([2n]);
      expect(stagedEntities[0].facts).toHaveLength(0);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = await store.getEntity(keyA, 'reader');
      expect(committed.body.map(f => f.toBigInt())).toEqual([2n]);
      expect(committed.facts).toHaveLength(0);
    });

    it('a terminate-then-record sequence rejects the record: the entity no longer exists', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // The staged terminate removes the entity from the job's view, so recording against it is rejected. Replaying a
      // re-recorded fact onto a re-created entity is covered by 'facts re-recorded after a terminate ...'.
      const JOB2 = 'rerecord-job';
      await store.terminateEntity(keyA, JOB2);
      await expect(store.recordFact(keyA, PROCESSED, [new Fr(3n)], undefined, JOB2)).rejects.toThrow(
        'non-existent entity',
      );
    });

    it('a create-then-terminate sequence leaves the entity deleted', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.terminateEntity(keyA, JOB);

      // Staged view: gone.
      expect((await store.getEntity(keyA, JOB)).body).toEqual([]);
      expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(0);
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);

      // Committed view: gone too, and no index residue blocks a later rollback.
      await kv.transactionAsync(() => store.commit(JOB));
      expect((await store.getEntity(keyA, 'reader')).body).toEqual([]);
      expect(await store.getEntities(entityTypeKey, 'reader')).toHaveLength(0);
      await store.discardStaged('reader'); // reads pin the job; release it so the rollback isn't blocked
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('recording a fact before its entity is created in the same job is rejected', async () => {
      await expect(store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );

      // Creating the entity first, then recording, is the supported order.
      await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      const staged = await store.getEntities(entityTypeKey, JOB);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's ops", async () => {
      await store.createEntity(keyA, [], undefined, 'setup-job');
      await kv.transactionAsync(() => store.commit('setup-job'));

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

    it('a job that has only read still blocks rollback until it is discarded', async () => {
      await store.getEntity(keyA, 'reader-job');
      await store.getEntities(entityTypeKey, 'reader-job');
      // Reads pin the job as in flight, so a rollback is refused until the job releases it.
      await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
        'PXE entity store rollback is not allowed while jobs are running',
      );

      await store.discardStaged('reader-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.createEntity(keyB, [new Fr(2n)], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB2);
      await store.discardStaged(JOB2);

      // The discarded writes are gone from the job's own view, and committing the job persists nothing.
      expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB2))).toEqual([corrA.toBigInt()]);
      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(keyA, 'reader')).facts).toHaveLength(0);
      expect((await store.getEntity(keyB, 'reader')).body).toEqual([]);
    });
  });

  describe('isolation', () => {
    it('entities under different scopes are isolated', async () => {
      const scope2 = AztecAddress.fromBigInt(2n);
      const keyScope2 = EntityKey.from({ ...keyA, scope: scope2 });
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      await store.createEntity(keyScope2, [new Fr(2n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Same contract, type and entity id, but each scope only sees its own entity.
      expect((await store.getEntity(keyA, JOB)).body.map(f => f.toBigInt())).toEqual([1n]);
      expect((await store.getEntity(keyScope2, JOB)).body.map(f => f.toBigInt())).toEqual([2n]);
      expect((await store.getEntity(keyScope2, JOB)).facts).toHaveLength(0);
      expect(await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, scope: scope2 }), JOB)).toHaveLength(1);

      // Terminating in one scope leaves the other untouched.
      const TERM = 'terminate-job';
      await store.terminateEntity(keyA, TERM);
      await kv.transactionAsync(() => store.commit(TERM));
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
      expect(await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, scope: scope2 }), JOB)).toHaveLength(1);
    });

    it('entities under different contracts and entity types are isolated', async () => {
      const contract2 = AztecAddress.fromBigInt(200n);
      const ENTITY2 = new Fr(8n);
      await store.createEntity(keyA, [new Fr(1n)], undefined, JOB);
      await store.createEntity(EntityKey.from({ ...keyA, contractAddress: contract2 }), [new Fr(2n)], undefined, JOB);
      await store.createEntity(EntityKey.from({ ...keyA, entityTypeId: ENTITY2 }), [new Fr(3n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const inScope = await store.getEntities(entityTypeKey, JOB);
      expect(inScope).toHaveLength(1);
      expect(inScope[0].body.map(f => f.toBigInt())).toEqual([1n]);
      expect(
        await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, contractAddress: contract2 }), JOB),
      ).toHaveLength(1);
      expect(
        await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, entityTypeId: ENTITY2 }), JOB),
      ).toHaveLength(1);
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
      const entities = await store.getEntities(entityTypeKey, JOB);
      const byId = new Map(entities.map(e => [e.key.entityId.toBigInt(), e.facts]));
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
      await store.createEntity(keyA, [], undefined, JOB);
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
      await store.discardStaged(JOB); // reads pin the job; release it so the next rollback isn't blocked

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
      await store.discardStaged(JOB); // reads pin the job; release it so the next rollback isn't blocked

      // A dangling block-4 fact index entry would make this second prune throw "Fact not found".
      await expect(kv.transactionAsync(() => store.rollback(3))).resolves.not.toThrow();
    });

    it('rollback is idempotent', async () => {
      await store.createEntity(keyA, [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(1n) }, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], { blockNumber: 7, blockHash: new Fr(2n) }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
    });
  });

  describe('recordFact requires an existing entity', () => {
    it('rejects when the entity exists only as a staged creation on another job', async () => {
      const OTHER = 'other-job';
      await store.createEntity(keyA, [new Fr(5n)], undefined, OTHER);

      // keyA is staged on OTHER, neither visible to this job nor committed, so the record is rejected.
      await expect(store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );
    });

    it('accepts a fact for an entity staged for creation earlier in the same job', async () => {
      await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB);
      expect((await store.getEntity(keyA, JOB)).facts).toHaveLength(1);
    });

    it('accepts a fact for an entity already committed to disk', async () => {
      await store.createEntity(keyA, [new Fr(5n)], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'record-job';
      await store.recordFact(keyA, RECEIVED, [new Fr(9n)], undefined, JOB2);
      expect((await store.getEntity(keyA, JOB2)).facts).toHaveLength(1);
    });
  });

  describe('index corruption detection', () => {
    it('getEntity fails loudly when the fact index references a missing row', async () => {
      await kv.openMultiMap<string, string>('facts_by_entity').set(keyA.toString(), 'bogus-fact-key');
      await expect(store.getEntity(keyA, JOB)).rejects.toThrow('Fact not found for factKey bogus-fact-key');
    });

    it('rollback fails loudly when the entity by-block index references a missing entity', async () => {
      await kv
        .openMultiMap<number, string>('entities_by_block')
        .set(7, EntityKey.from({ ...keyA, entityId: new Fr(0xdeadn) }).toString());
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
