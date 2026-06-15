import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityStore } from './entity_store.js';
import { EntityKey, EntityTypeKey } from './entity_store_keys.js';

describe('EntityStore', () => {
  let contract: AztecAddress;
  let scope: AztecAddress;
  let ENTITY: Fr;
  let RECEIVED: Fr;
  let PROCESSED: Fr;
  let corrA: Fr;
  let corrB: Fr;
  let keyA: EntityKey;
  let keyB: EntityKey;
  let entityTypeKey: EntityTypeKey;
  const JOB = 'fact-store-test-job';

  let kv: AztecAsyncKVStore;
  let store: EntityStore;

  beforeEach(async () => {
    contract = await AztecAddress.random();
    scope = await AztecAddress.random();
    ENTITY = Fr.random();
    RECEIVED = Fr.random();
    PROCESSED = Fr.random();
    corrA = Fr.random();
    corrB = Fr.random();
    keyA = EntityKey.from({ contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrA });
    keyB = EntityKey.from({ contractAddress: contract, scope, entityTypeId: ENTITY, entityId: corrB });
    entityTypeKey = EntityTypeKey.from({ contractAddress: contract, scope, entityTypeId: ENTITY });

    kv = await openTmpStore('fact-store-test');
    store = new EntityStore(kv);
  });
  afterEach(async () => {
    await kv.close();
  });

  const entityIdsOf = (entities: { key: EntityKey }[]) => entities.map(e => e.key.entityId.toBigInt());

  it('records facts and loads an entity fact set after commit', async () => {
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = (await store.getEntity(keyA, JOB))!;
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('returns facts in creation order', async () => {
    // Random payloads make the dedup row key (payload hash) order almost surely differ from creation order, so this
    // asserts facts come back in creation order rather than in storage order.
    const payloads = Array.from({ length: 8 }, () => Fr.random());
    await store.createEntity(keyA, [], undefined, JOB);
    for (const payload of payloads.slice(0, 5)) {
      await store.recordFact(keyA, RECEIVED, [payload], undefined, JOB);
    }
    await kv.transactionAsync(() => store.commit(JOB));

    // Later facts, committed by a second job, follow the earlier ones.
    const JOB2 = 'later-job';
    for (const payload of payloads.slice(5)) {
      await store.recordFact(keyA, RECEIVED, [payload], undefined, JOB2);
    }
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = (await store.getEntity(keyA, JOB))!;
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual(payloads.map(f => f.toBigInt()));
  });

  it('staged facts follow committed facts in creation order (read-your-writes)', async () => {
    const payloads = Array.from({ length: 4 }, () => Fr.random());
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [payloads[0]], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [payloads[1]], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'staged-job';
    await store.recordFact(keyA, RECEIVED, [payloads[2]], undefined, JOB2);
    await store.recordFact(keyA, RECEIVED, [payloads[3]], undefined, JOB2);

    const { facts } = (await store.getEntity(keyA, JOB2))!;
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual(payloads.map(f => f.toBigInt()));
  });

  it('dedups identical (entity, factType, payload, originBlock) records idempotently', async () => {
    const payload = Fr.random();
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [payload], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [payload], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = (await store.getEntity(keyA, JOB))!;
    expect(facts).toHaveLength(1);
  });

  it('re-recording an identical fact (same origin block) is a no-op keeping its creation position', async () => {
    const blockFiveFact = Fr.random();
    const plainFact = Fr.random();
    const origin5 = { blockNumber: 5, blockHash: Fr.random() };
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [blockFiveFact], origin5, JOB);
    await store.recordFact(keyA, RECEIVED, [plainFact], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-recording the block-5 fact verbatim in a later job is a no-op.
    const JOB2 = 'rerecord-job';
    await store.recordFact(keyA, RECEIVED, [blockFiveFact], origin5, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = (await store.getEntity(keyA, JOB))!;
    expect(facts.map(f => f.payload[0].toBigInt())).toEqual([blockFiveFact, plainFact].map(f => f.toBigInt()));
    expect(facts[0].originBlock?.blockNumber).toBe(5);
  });

  it('the same payload at a different origin block is a distinct fact', async () => {
    const payload = Fr.random();
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [payload], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await store.recordFact(keyA, RECEIVED, [payload], { blockNumber: 10, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = (await store.getEntity(keyA, JOB))!;
    expect(facts.map(f => f.originBlock?.blockNumber)).toEqual([5, 10]);
  });

  it('the same payload at two origin blocks yields independent facts pruned per block', async () => {
    const payload = Fr.random();
    await store.createEntity(keyA, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [payload], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await store.recordFact(keyA, RECEIVED, [payload], { blockNumber: 10, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Prune above block 7: the block-10 derivation is deleted, the block-5 one survives.
    await kv.transactionAsync(() => store.rollback(7));
    expect((await store.getEntity(keyA, JOB))!.facts.map(f => f.originBlock?.blockNumber)).toEqual([5]);
    await store.discardStaged(JOB); // reads pin the job; release it so the next rollback isn't blocked

    // Prune above block 4: the block-5 derivation is deleted too.
    await kv.transactionAsync(() => store.rollback(4));
    expect((await store.getEntity(keyA, JOB))!.facts).toHaveLength(0);
  });

  it('enumerates active entities (created and not terminated) for a scope', async () => {
    await store.createEntity(keyA, [], undefined, JOB);
    await store.createEntity(keyB, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyB, RECEIVED, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entityIdsOf(entities).sort()).toEqual([corrA.toBigInt(), corrB.toBigInt()].sort());
  });

  it('getEntities returns each entity complete with body and facts in creation order', async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(keyA, entityBody, undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entities).toHaveLength(1);
    expect(entities[0].body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
    expect(entities[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('lists an entity as active even when it has zero facts', async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entityIdsOf(entities)).toEqual([corrA.toBigInt()]);
    expect(entities[0].facts).toHaveLength(0);
  });

  it('createEntity rejects an entity already staged for creation in the same job', async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await expect(store.createEntity(keyA, [Fr.random()], undefined, JOB)).rejects.toThrow('already existing entity');
  });

  it('createEntity rejects an entity already committed to disk', async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await expect(store.createEntity(keyA, [Fr.random()], undefined, 'recreate-job')).rejects.toThrow(
      'already existing entity',
    );
  });

  it("reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);

    // Same job, before commit: the staged entity is active and its fact is visible.
    const { facts } = (await store.getEntity(keyA, JOB))!;
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect(await store.getEntity(keyA, 'other-job')).toBeUndefined();
    expect(await store.getEntities(entityTypeKey, 'other-job')).toHaveLength(0);
  });

  it('getEntity returns the body and both facts of an entity with facts', async () => {
    const entityBody = [Fr.random(), Fr.random()];
    await store.createEntity(keyA, entityBody, undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = (await store.getEntity(keyA, JOB))!;
    expect(body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt(), PROCESSED.toBigInt()]);
  });

  it('getEntity returns the body and empty facts for an entity with zero facts', async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(keyA, entityBody, undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = (await store.getEntity(keyA, JOB))!;
    expect(body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
    expect(facts).toHaveLength(0);
  });

  it('getEntity returns undefined when no entity record exists', async () => {
    expect(await store.getEntity(keyA, JOB)).toBeUndefined();
  });

  it("getEntity reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(keyA, entityBody, undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);

    const { body, facts } = (await store.getEntity(keyA, JOB))!;
    expect(body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);

    // A different job does not see the uncommitted write.
    expect(await store.getEntity(keyA, 'other-job')).toBeUndefined();
  });

  it('hides an entity from its own job after a staged terminate, even over committed facts', async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A later job stages a terminate; within that job the entity reads as gone, while other jobs still see it
    // committed until the terminate commits.
    const TERM = 'terminate-job';
    await store.terminateEntity(keyA, TERM);

    expect(await store.getEntity(keyA, TERM)).toBeUndefined();
    expect(await store.getEntities(entityTypeKey, TERM)).toHaveLength(0);
    expect((await store.getEntity(keyA, 'reader'))!.facts).toHaveLength(1);
  });

  it('terminateEntity rejects a non-existent entity', async () => {
    await expect(store.terminateEntity(keyA, JOB)).rejects.toThrow('non-existent entity');
  });

  it('terminateEntity rejects an entity already terminated earlier in the same job', async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(keyA, TERM);
    await expect(store.terminateEntity(keyA, TERM)).rejects.toThrow('non-existent entity');
  });

  it('terminateEntity deletes the entity record, all its facts, and drops it from active enumeration', async () => {
    await store.createEntity(keyA, [Fr.random()], undefined, JOB);
    await store.createEntity(keyB, [], undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await store.recordFact(keyB, RECEIVED, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(keyA, TERM);
    await kv.transactionAsync(() => store.commit(TERM));

    expect(await store.getEntity(keyA, JOB)).toBeUndefined();
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrB.toBigInt()]);
    // The neighbouring entity is untouched.
    expect((await store.getEntity(keyB, JOB))!.facts).toHaveLength(1);
  });

  it('rollback deletes a retractable entity wholesale (body + every fact) above the target block', async () => {
    // Retractable entity originating at block 6, owning one fact without an origin block and one with.
    await store.createEntity(keyA, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 7, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    expect(await store.getEntity(keyA, JOB)).toBeUndefined();
    expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
  });

  it('rollback keeps a non-retractable entity, pruning only its retractable facts', async () => {
    // Non-retractable entity (no origin block) with a non-retractable fact + a fact originating at block 6.
    const entityBody = [Fr.random()];
    await store.createEntity(keyA, entityBody, undefined, JOB);
    await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { body, facts } = (await store.getEntity(keyA, JOB))!;
    expect(body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]); // Processed pruned, Received kept
    // Entity stays active because the entity record survives.
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('rollback above all origin blocks is a no-op', async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(keyA, entityBody, { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await store.recordFact(keyA, PROCESSED, [], { blockNumber: 7, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(10));

    const { body, facts } = (await store.getEntity(keyA, JOB))!;
    expect(body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
    expect(facts.map(f => f.factTypeId.toBigInt())).toEqual([PROCESSED.toBigInt()]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([corrA.toBigInt()]);
  });

  it('replacing an entity requires an explicit terminate-then-create', async () => {
    const replacementBody = [Fr.random()];
    await store.createEntity(keyA, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A plain re-create now rejects; terminate-then-create is the supported way to replace the entity.
    const JOB2 = 'replace-job';
    await store.terminateEntity(keyA, JOB2);
    await store.createEntity(keyA, replacementBody, undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    await kv.transactionAsync(() => store.rollback(5));

    // Survived: the replacement entity is non-retractable.
    const { body } = (await store.getEntity(keyA, JOB))!;
    expect(body.map(f => f.toBigInt())).toEqual(replacementBody.map(f => f.toBigInt()));
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
      const recreatedBody = [Fr.random()];
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'replace-job';
      await store.terminateEntity(keyA, JOB2);
      await store.createEntity(keyA, recreatedBody, undefined, JOB2);

      // Staged view: the re-created entity, with the terminate having wiped the committed fact.
      const staged = (await store.getEntity(keyA, JOB2))!;
      expect(staged.body.map(f => f.toBigInt())).toEqual(recreatedBody.map(f => f.toBigInt()));
      expect(staged.facts).toHaveLength(0);
      const stagedEntities = await store.getEntities(entityTypeKey, JOB2);
      expect(stagedEntities).toHaveLength(1);
      expect(stagedEntities[0].body.map(f => f.toBigInt())).toEqual(recreatedBody.map(f => f.toBigInt()));
      expect(stagedEntities[0].facts).toHaveLength(0);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = (await store.getEntity(keyA, 'reader'))!;
      expect(committed.body.map(f => f.toBigInt())).toEqual(recreatedBody.map(f => f.toBigInt()));
      expect(committed.facts).toHaveLength(0);
    });

    it('a terminate-then-record sequence rejects the record: the entity no longer exists', async () => {
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // The staged terminate removes the entity from the job's view, so recording against it is rejected. Replaying a
      // re-recorded fact onto a re-created entity is covered by 'facts re-recorded after a terminate ...'.
      const JOB2 = 'rerecord-job';
      await store.terminateEntity(keyA, JOB2);
      await expect(store.recordFact(keyA, PROCESSED, [Fr.random()], undefined, JOB2)).rejects.toThrow(
        'non-existent entity',
      );
    });

    it('a create-then-terminate sequence leaves the entity deleted', async () => {
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
      await store.terminateEntity(keyA, JOB);

      // Staged view: gone.
      expect(await store.getEntity(keyA, JOB)).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);

      // Committed view: gone too, and no index residue blocks a later rollback.
      await kv.transactionAsync(() => store.commit(JOB));
      expect(await store.getEntity(keyA, 'reader')).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, 'reader')).toHaveLength(0);
      await store.discardStaged('reader'); // reads pin the job; release it so the rollback isn't blocked
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('recording a fact before its entity is created in the same job is rejected', async () => {
      await expect(store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );

      // Creating the entity first, then recording, is the supported order.
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
      const staged = await store.getEntities(entityTypeKey, JOB);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts.map(f => f.factTypeId.toBigInt())).toEqual([RECEIVED.toBigInt()]);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's ops", async () => {
      const payloads = [Fr.random(), Fr.random()];
      await store.createEntity(keyA, [], undefined, 'setup-job');
      await kv.transactionAsync(() => store.commit('setup-job'));

      const JOB2 = 'second-job';
      await store.recordFact(keyA, RECEIVED, [payloads[0]], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [payloads[1]], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only job 1's fact is committed; job 2 still layers its staged fact on top.
      expect((await store.getEntity(keyA, 'reader'))!.facts.map(f => f.payload[0].toBigInt())).toEqual([
        payloads[0].toBigInt(),
      ]);
      expect((await store.getEntity(keyA, JOB2))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        payloads.map(f => f.toBigInt()),
      );

      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(keyA, 'reader'))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        payloads.map(f => f.toBigInt()),
      );
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

    it('commit rejects a createEntity whose entity was already committed by a racing job', async () => {
      // The write-time guard only inspects the calling job's staged ops plus committed state, so two jobs can
      // both stage a create for the same key without seeing each other. The second to commit must be rejected.
      const JOB2 = 'racing-job';
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await store.createEntity(keyA, [Fr.random()], undefined, JOB2);

      await kv.transactionAsync(() => store.commit(JOB));
      await expect(kv.transactionAsync(() => store.commit(JOB2))).rejects.toThrow('already existing entity');
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.createEntity(keyB, [Fr.random()], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB2);
      await store.discardStaged(JOB2);

      // The discarded writes are gone from the job's own view, and committing the job persists nothing.
      expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB2))).toEqual([corrA.toBigInt()]);
      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(keyA, 'reader'))!.facts).toHaveLength(0);
      expect(await store.getEntity(keyB, 'reader')).toBeUndefined();
    });
  });

  describe('isolation', () => {
    it('entities under different scopes are isolated', async () => {
      const scope2 = await AztecAddress.random();
      const keyScope2 = EntityKey.from({ ...keyA, scope: scope2 });
      const bodyA = [Fr.random()];
      const bodyScope2 = [Fr.random()];
      await store.createEntity(keyA, bodyA, undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
      await store.createEntity(keyScope2, bodyScope2, undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Same contract, type and entity id, but each scope only sees its own entity.
      expect((await store.getEntity(keyA, JOB))!.body.map(f => f.toBigInt())).toEqual(bodyA.map(f => f.toBigInt()));
      expect((await store.getEntity(keyScope2, JOB))!.body.map(f => f.toBigInt())).toEqual(
        bodyScope2.map(f => f.toBigInt()),
      );
      expect((await store.getEntity(keyScope2, JOB))!.facts).toHaveLength(0);
      expect(await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, scope: scope2 }), JOB)).toHaveLength(1);

      // Terminating in one scope leaves the other untouched.
      const TERM = 'terminate-job';
      await store.terminateEntity(keyA, TERM);
      await kv.transactionAsync(() => store.commit(TERM));
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
      expect(await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, scope: scope2 }), JOB)).toHaveLength(1);
    });

    it('entities under different contracts and entity types are isolated', async () => {
      const contract2 = await AztecAddress.random();
      const ENTITY2 = Fr.random();
      const bodyInScope = [Fr.random()];
      await store.createEntity(keyA, bodyInScope, undefined, JOB);
      await store.createEntity(EntityKey.from({ ...keyA, contractAddress: contract2 }), [Fr.random()], undefined, JOB);
      await store.createEntity(EntityKey.from({ ...keyA, entityTypeId: ENTITY2 }), [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const inScope = await store.getEntities(entityTypeKey, JOB);
      expect(inScope).toHaveLength(1);
      expect(inScope[0].body.map(f => f.toBigInt())).toEqual(bodyInScope.map(f => f.toBigInt()));
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
      const aPayloads = [Fr.random(), Fr.random()];
      const bPayloads = [Fr.random(), Fr.random()];
      await store.createEntity(keyA, [], undefined, JOB);
      await store.createEntity(keyB, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [aPayloads[0]], undefined, JOB);
      await store.recordFact(keyB, RECEIVED, [bPayloads[0]], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [aPayloads[1]], undefined, JOB);
      await store.recordFact(keyB, RECEIVED, [bPayloads[1]], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getEntity(keyA, JOB))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        aPayloads.map(f => f.toBigInt()),
      );
      expect((await store.getEntity(keyB, JOB))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        bPayloads.map(f => f.toBigInt()),
      );
      // getEntities returns the same per-entity order.
      const entities = await store.getEntities(entityTypeKey, JOB);
      const byId = new Map(entities.map(e => [e.key.entityId.toBigInt(), e.facts]));
      expect(byId.get(corrA.toBigInt())!.map(f => f.payload[0].toBigInt())).toEqual(aPayloads.map(f => f.toBigInt()));
      expect(byId.get(corrB.toBigInt())!.map(f => f.payload[0].toBigInt())).toEqual(bPayloads.map(f => f.toBigInt()));
    });

    it('creation order is preserved after a prune removes facts from the middle', async () => {
      const first = Fr.random();
      const middle = Fr.random();
      const last = Fr.random();
      await store.createEntity(keyA, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [first], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [middle], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await store.recordFact(keyA, RECEIVED, [last], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      expect((await store.getEntity(keyA, JOB))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        [first, last].map(f => f.toBigInt()),
      );
    });

    it('facts re-recorded after a terminate take fresh creation positions', async () => {
      const [p1, p2] = [Fr.random(), Fr.random()];
      await store.createEntity(keyA, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [p1], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [p2], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Terminate wipes the facts; re-recording them in reverse order is a new creation order.
      const JOB2 = 'replay-job';
      await store.terminateEntity(keyA, JOB2);
      await store.createEntity(keyA, [], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [p2], undefined, JOB2);
      await store.recordFact(keyA, RECEIVED, [p1], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB2));

      expect((await store.getEntity(keyA, JOB))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        [p2, p1].map(f => f.toBigInt()),
      );
    });

    it('creation order continues across store reopens', async () => {
      const payloads = Array.from({ length: 4 }, () => Fr.random());
      await store.createEntity(keyA, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [payloads[0]], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [payloads[1]], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // A fresh EntityStore over the same kv store continues the persisted sequence instead of restarting it.
      const reopened = new EntityStore(kv);
      const JOB2 = 'reopened-job';
      await reopened.recordFact(keyA, RECEIVED, [payloads[2]], undefined, JOB2);
      await reopened.recordFact(keyA, RECEIVED, [payloads[3]], undefined, JOB2);
      await kv.transactionAsync(() => reopened.commit(JOB2));

      expect((await reopened.getEntity(keyA, JOB2))!.facts.map(f => f.payload[0].toBigInt())).toEqual(
        payloads.map(f => f.toBigInt()),
      );
    });
  });

  describe('rollback boundaries and index hygiene', () => {
    it('records originating exactly at the target block survive a rollback', async () => {
      const entityBody = [Fr.random()];
      await store.createEntity(keyA, entityBody, { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only records strictly above the target block are pruned.
      await kv.transactionAsync(() => store.rollback(5));
      const { body, facts } = (await store.getEntity(keyA, JOB))!;
      expect(body.map(f => f.toBigInt())).toEqual(entityBody.map(f => f.toBigInt()));
      expect(facts).toHaveLength(1);
      await store.discardStaged(JOB); // reads pin the job; release it so the next rollback isn't blocked

      await kv.transactionAsync(() => store.rollback(4));
      expect(await store.getEntity(keyA, JOB)).toBeUndefined();
    });

    it('pruning an entity clears the by-block entries of facts below the prune point', async () => {
      // Entity originating at block 6 owning a fact originating at block 4: pruning above 5 deletes the entity
      // wholesale, including the block-4 fact and its index entry.
      await store.createEntity(keyA, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], { blockNumber: 4, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      expect(await store.getEntity(keyA, JOB)).toBeUndefined();
      await store.discardStaged(JOB); // reads pin the job; release it so the next rollback isn't blocked

      // A dangling block-4 fact index entry would make this second prune throw "Fact not found".
      await expect(kv.transactionAsync(() => store.rollback(3))).resolves.not.toThrow();
    });

    it('rollback is idempotent', async () => {
      await store.createEntity(keyA, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], { blockNumber: 7, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
    });
  });

  describe('recordFact requires an existing entity', () => {
    it('rejects when the entity exists only as a staged creation on another job', async () => {
      const OTHER = 'other-job';
      await store.createEntity(keyA, [Fr.random()], undefined, OTHER);

      // keyA is staged on OTHER, neither visible to this job nor committed, so the record is rejected.
      await expect(store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );
    });

    it('accepts a fact for an entity staged for creation earlier in the same job', async () => {
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB);
      expect((await store.getEntity(keyA, JOB))!.facts).toHaveLength(1);
    });

    it('accepts a fact for an entity already committed to disk', async () => {
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'record-job';
      await store.recordFact(keyA, RECEIVED, [Fr.random()], undefined, JOB2);
      expect((await store.getEntity(keyA, JOB2))!.facts).toHaveLength(1);
    });
  });

  describe('index inconsistency handling', () => {
    it('getEntity fails loudly when the fact index references a missing row', async () => {
      await store.createEntity(keyA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.openMultiMap<string, string>('facts_by_entity').set(keyA.toString(), 'bogus-fact-key');
      await expect(store.getEntity(keyA, JOB)).rejects.toThrow('Fact not found for factKey bogus-fact-key');
    });

    it('rollback tolerates a dangling entity by-block index entry and still prunes real entities', async () => {
      // A real retractable entity above the prune point, alongside a by-block entry pointing at a missing entity.
      await store.createEntity(keyA, [Fr.random()], { blockNumber: 8, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));
      await kv
        .openMultiMap<number, string>('entities_by_block')
        .set(7, EntityKey.from({ ...keyA, entityId: Fr.random() }).toString());

      // The dangling entry is skipped rather than aborting the rollback, and the real entity is still pruned.
      await kv.transactionAsync(() => store.rollback(5));
      expect(await store.getEntity(keyA, 'reader')).toBeUndefined();
    });

    it('rollback tolerates a dangling fact by-block index entry and still prunes real facts', async () => {
      await store.createEntity(keyA, [], undefined, JOB);
      await store.recordFact(keyA, RECEIVED, [Fr.random()], { blockNumber: 8, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));
      await kv.openMultiMap<number, string>('facts_by_block').set(7, 'bogus-fact-key');

      // The dangling entry is skipped rather than aborting the rollback, and the real fact is still pruned.
      await kv.transactionAsync(() => store.rollback(5));
      expect((await store.getEntity(keyA, 'reader'))!.facts).toHaveLength(0);
    });
  });
});
