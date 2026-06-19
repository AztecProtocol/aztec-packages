import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityStore } from './entity_store.js';
import { EntityKey, EntityTypeKey } from './entity_store_keys.js';

describe('EntityStore', () => {
  let contract: AztecAddress;
  let scope: AztecAddress;
  let entityTypeId: Fr;
  let factTypeA: Fr;
  let factTypeB: Fr;
  let entityId1: Fr;
  let entityId2: Fr;
  let entityKey1: EntityKey;
  let entityKey2: EntityKey;
  let entityTypeKey: EntityTypeKey;
  const JOB = 'fact-store-test-job';

  let kv: AztecAsyncKVStore;
  let store: EntityStore;

  beforeEach(async () => {
    contract = await AztecAddress.random();
    scope = await AztecAddress.random();
    entityTypeId = Fr.random();
    factTypeA = Fr.random();
    factTypeB = Fr.random();
    entityId1 = Fr.random();
    entityId2 = Fr.random();
    entityKey1 = EntityKey.from({ contractAddress: contract, scope, entityTypeId: entityTypeId, entityId: entityId1 });
    entityKey2 = EntityKey.from({ contractAddress: contract, scope, entityTypeId: entityTypeId, entityId: entityId2 });
    entityTypeKey = EntityTypeKey.from({ contractAddress: contract, scope, entityTypeId: entityTypeId });

    kv = await openTmpStore('fact-store-test');
    store = new EntityStore(kv);
  });
  afterEach(async () => {
    await kv.close();
  });

  const entityIdsOf = (entities: { key: EntityKey }[]) => entities.map(e => e.key.entityId);

  it('records facts and loads an entity fact set after commit', async () => {
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeB, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeA, factTypeB]);
  });

  it('returns facts in creation order', async () => {
    const payloads = Array.from({ length: 8 }, () => Fr.random());
    await store.createEntity(entityKey1, [], undefined, JOB);
    for (const payload of payloads.slice(0, 5)) {
      await store.recordFact(entityKey1, factTypeA, [payload], undefined, JOB);
    }
    await kv.transactionAsync(() => store.commit(JOB));

    // Later facts, committed by a second job, follow the earlier ones.
    const JOB2 = 'later-job';
    for (const payload of payloads.slice(5)) {
      await store.recordFact(entityKey1, factTypeA, [payload], undefined, JOB2);
    }
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(facts.map(f => f.payload[0])).toEqual(payloads);
  });

  it('staged facts follow committed facts in creation order (read-your-writes)', async () => {
    const payloads = Array.from({ length: 4 }, () => Fr.random());
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [payloads[0]], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [payloads[1]], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const JOB2 = 'staged-job';
    await store.recordFact(entityKey1, factTypeA, [payloads[2]], undefined, JOB2);
    await store.recordFact(entityKey1, factTypeA, [payloads[3]], undefined, JOB2);

    const { facts } = (await store.getEntity(entityKey1, JOB2))!;
    expect(facts.map(f => f.payload[0])).toEqual(payloads);
  });

  it('dedups identical (entity, factType, payload, originBlock) fact records idempotently', async () => {
    const payload = Fr.random();
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [payload], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [payload], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(facts).toHaveLength(1);
  });

  it('re-recording an identical fact (same origin block) is a no-op keeping its original fact position', async () => {
    const blockFiveFact = Fr.random();
    const plainFact = Fr.random();
    const origin5 = { blockNumber: 5, blockHash: Fr.random() };
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [blockFiveFact], origin5, JOB);
    await store.recordFact(entityKey1, factTypeA, [plainFact], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-recording the block-5 fact verbatim in a later job is a no-op.
    const JOB2 = 'rerecord-job';
    await store.recordFact(entityKey1, factTypeA, [blockFiveFact], origin5, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    const { facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(facts.map(f => f.payload[0])).toEqual([blockFiveFact, plainFact]);
    expect(facts[0].originBlock?.blockNumber).toBe(5);
  });

  it('the same payload at a different origin block is a distinct fact', async () => {
    const payload = Fr.random();
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [payload], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await store.recordFact(entityKey1, factTypeA, [payload], { blockNumber: 10, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(facts.map(f => f.originBlock?.blockNumber)).toEqual([5, 10]);
  });

  it('the same payload at two origin blocks yields independent facts pruned per block', async () => {
    const payload = Fr.random();
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [payload], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await store.recordFact(entityKey1, factTypeA, [payload], { blockNumber: 10, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Prune above block 7: the block-10 derivation is deleted, the block-5 one survives.
    await kv.transactionAsync(() => store.rollback(7));
    expect((await store.getEntity(entityKey1, JOB))!.facts.map(f => f.originBlock?.blockNumber)).toEqual([5]);
    await store.discardStaged(JOB); // discard job so the next rollback isn't blocked

    // Prune above block 4: the block-5 derivation is deleted too.
    await kv.transactionAsync(() => store.rollback(4));
    expect((await store.getEntity(entityKey1, JOB))!.facts).toHaveLength(0);
  });

  it('enumerates active entities (created and not terminated) for a scope', async () => {
    await store.createEntity(entityKey1, [], undefined, JOB);
    await store.createEntity(entityKey2, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey2, factTypeA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entityIdsOf(entities).sort()).toEqual([entityId1, entityId2].sort());
  });

  it('getEntities returns each entity complete with body and facts in creation order', async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(entityKey1, entityBody, undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeB, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entities).toHaveLength(1);
    expect(entities[0].body).toEqual(entityBody);
    expect(entities[0].facts.map(f => f.factTypeId)).toEqual([factTypeA, factTypeB]);
  });

  it('lists an entity as active even when it has zero facts', async () => {
    await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const entities = await store.getEntities(entityTypeKey, JOB);
    expect(entityIdsOf(entities)).toEqual([entityId1]);
    expect(entities[0].facts).toHaveLength(0);
  });

  it('createEntity is a no-op for an entity already staged in the same job (first write wins)', async () => {
    const firstBody = [Fr.random()];
    await store.createEntity(entityKey1, firstBody, undefined, JOB);
    // A second create for the same key neither throws nor overwrites the first.
    await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);

    expect((await store.getEntity(entityKey1, JOB))!.body).toEqual(firstBody);
  });

  it('createEntity is a no-op for an already committed entity, preserving its facts (first write wins)', async () => {
    const firstBody = [Fr.random()];
    await store.createEntity(entityKey1, firstBody, undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // Re-creating the committed entity with a different body neither throws nor replaces it, and leaves its facts intact.
    await store.createEntity(entityKey1, [Fr.random()], undefined, 'recreate-job');
    await kv.transactionAsync(() => store.commit('recreate-job'));

    const { body, facts } = (await store.getEntity(entityKey1, 'reader'))!;
    expect(body).toEqual(firstBody);
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeA]);
  });

  it("reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);

    // Same job, before commit: the staged entity is active and its fact is visible.
    const { facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeA]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([entityId1]);

    // A different job does not see the uncommitted write.
    expect(await store.getEntity(entityKey1, 'other-job')).toBeUndefined();
    expect(await store.getEntities(entityTypeKey, 'other-job')).toHaveLength(0);
  });

  it('getEntity returns the body and both facts of an entity with facts', async () => {
    const entityBody = [Fr.random(), Fr.random()];
    await store.createEntity(entityKey1, entityBody, undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeB, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(body).toEqual(entityBody);
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeA, factTypeB]);
  });

  it('getEntity returns the body and empty facts for an entity with zero facts', async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(entityKey1, entityBody, undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const { body, facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(body).toEqual(entityBody);
    expect(facts).toHaveLength(0);
  });

  it('getEntity returns undefined when no entity record exists', async () => {
    expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
  });

  it("getEntity reflects a job's own staged createEntity before commit (read-your-writes)", async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(entityKey1, entityBody, undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);

    const { body, facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(body).toEqual(entityBody);
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeA]);

    // A different job does not see the uncommitted write.
    expect(await store.getEntity(entityKey1, 'other-job')).toBeUndefined();
  });

  it('hides an entity from its own job after a staged terminate, even over committed facts', async () => {
    await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A later job stages a terminate; within that job the entity reads as gone, while other jobs still see it
    // committed until the terminate commits.
    const TERM = 'terminate-job';
    await store.terminateEntity(entityKey1, TERM);

    expect(await store.getEntity(entityKey1, TERM)).toBeUndefined();
    expect(await store.getEntities(entityTypeKey, TERM)).toHaveLength(0);
    expect((await store.getEntity(entityKey1, 'reader'))!.facts).toHaveLength(1);
  });

  it('terminateEntity rejects a non-existent entity', async () => {
    await expect(store.terminateEntity(entityKey1, JOB)).rejects.toThrow('non-existent entity');
  });

  it('terminateEntity rejects an entity already terminated earlier in the same job', async () => {
    await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(entityKey1, TERM);
    await expect(store.terminateEntity(entityKey1, TERM)).rejects.toThrow('non-existent entity');
  });

  it('terminateEntity deletes the entity record, all its facts, and drops it from active enumeration', async () => {
    await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
    await store.createEntity(entityKey2, [], undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeB, [], { blockNumber: 5, blockHash: Fr.random() }, JOB);
    await store.recordFact(entityKey2, factTypeA, [Fr.random()], undefined, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    const TERM = 'terminate-job';
    await store.terminateEntity(entityKey1, TERM);
    await kv.transactionAsync(() => store.commit(TERM));

    expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([entityId2]);
    // The neighbouring entity is untouched.
    expect((await store.getEntity(entityKey2, JOB))!.facts).toHaveLength(1);
  });

  it('rollback deletes a retractable entity completely (body + every fact) above the target block', async () => {
    // Retractable entity originating at block 6, owning one fact without an origin block and one with.
    await store.createEntity(entityKey1, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeB, [], { blockNumber: 7, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
    expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
  });

  it('rollback keeps a non-retractable entity, pruning only its retractable facts', async () => {
    // Non-retractable entity (no origin block) with a non-retractable fact + a fact originating at block 6.
    const entityBody = [Fr.random()];
    await store.createEntity(entityKey1, entityBody, undefined, JOB);
    await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
    await store.recordFact(entityKey1, factTypeB, [], { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(5));

    const { body, facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(body).toEqual(entityBody);
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeA]);
    // Entity stays active because the entity record survives.
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([entityId1]);
  });

  it('rollback above all origin blocks is a no-op', async () => {
    const entityBody = [Fr.random()];
    await store.createEntity(entityKey1, entityBody, { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await store.recordFact(entityKey1, factTypeB, [], { blockNumber: 7, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    await kv.transactionAsync(() => store.rollback(10));

    const { body, facts } = (await store.getEntity(entityKey1, JOB))!;
    expect(body).toEqual(entityBody);
    expect(facts.map(f => f.factTypeId)).toEqual([factTypeB]);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([entityId1]);
  });

  it('replacing an entity requires an explicit terminate-then-create', async () => {
    const replacementBody = [Fr.random()];
    await store.createEntity(entityKey1, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
    await kv.transactionAsync(() => store.commit(JOB));

    // A plain re-create is a no-op (first write wins); terminate-then-create is the supported way to replace the entity.
    const JOB2 = 'replace-job';
    await store.terminateEntity(entityKey1, JOB2);
    await store.createEntity(entityKey1, replacementBody, undefined, JOB2);
    await kv.transactionAsync(() => store.commit(JOB2));

    await kv.transactionAsync(() => store.rollback(5));

    // Survived: the replacement entity is non-retractable.
    const { body } = (await store.getEntity(entityKey1, JOB))!;
    expect(body).toEqual(replacementBody);
    expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB))).toEqual([entityId1]);
  });

  it('rollback throws while a job has staged writes', async () => {
    await store.createEntity(entityKey1, [], undefined, 'uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
      'PXE entity store rollback is not allowed while jobs are running',
    );
    await store.discardStaged('uncommitted-job');
    await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
  });

  describe('staged op ordering', () => {
    it('a terminate-then-create sequence resolves to the re-created entity', async () => {
      const recreatedBody = [Fr.random()];
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'replace-job';
      await store.terminateEntity(entityKey1, JOB2);
      await store.createEntity(entityKey1, recreatedBody, undefined, JOB2);

      // Staged view: the re-created entity, with the terminate having wiped the committed fact.
      const staged = (await store.getEntity(entityKey1, JOB2))!;
      expect(staged.body).toEqual(recreatedBody);
      expect(staged.facts).toHaveLength(0);
      const stagedEntities = await store.getEntities(entityTypeKey, JOB2);
      expect(stagedEntities).toHaveLength(1);
      expect(stagedEntities[0].body).toEqual(recreatedBody);
      expect(stagedEntities[0].facts).toHaveLength(0);

      // The committed view matches the staged view.
      await kv.transactionAsync(() => store.commit(JOB2));
      const committed = (await store.getEntity(entityKey1, 'reader'))!;
      expect(committed.body).toEqual(recreatedBody);
      expect(committed.facts).toHaveLength(0);
    });

    it('a terminate-then-record sequence rejects the record: the entity no longer exists', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // The staged terminate removes the entity from the job's view, so recording against it is rejected. Replaying a
      // re-recorded fact onto a re-created entity is covered by 'facts re-recorded after a terminate ...'.
      const JOB2 = 'rerecord-job';
      await store.terminateEntity(entityKey1, JOB2);
      await expect(store.recordFact(entityKey1, factTypeB, [Fr.random()], undefined, JOB2)).rejects.toThrow(
        'non-existent entity',
      );
    });

    it('a create-then-terminate sequence leaves the entity deleted', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.terminateEntity(entityKey1, JOB);

      // Staged view: gone.
      expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);

      // Committed view: gone too, and no index residue blocks a later rollback.
      await kv.transactionAsync(() => store.commit(JOB));
      expect(await store.getEntity(entityKey1, 'reader')).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, 'reader')).toHaveLength(0);
      await store.discardStaged('reader'); // discard job so the rollback isn't blocked
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('a staged create-then-terminate makes the entity non-existent to later ops in the same job', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.terminateEntity(entityKey1, JOB);

      await expect(store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );
      await expect(store.terminateEntity(entityKey1, JOB)).rejects.toThrow('non-existent entity');

      // Committing the create-then-terminate pair persists nothing.
      await kv.transactionAsync(() => store.commit(JOB));
      expect(await store.getEntity(entityKey1, 'reader')).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, 'reader')).toHaveLength(0);
    });

    it('a staged create-then-terminate drops a committed entity for later ops in the same job', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'recreate-then-terminate-job';
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB2);
      await store.terminateEntity(entityKey1, JOB2);

      await expect(store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB2)).rejects.toThrow(
        'non-existent entity',
      );
      await expect(store.terminateEntity(entityKey1, JOB2)).rejects.toThrow('non-existent entity');

      // Committing JOB2 removes the previously committed entity.
      await kv.transactionAsync(() => store.commit(JOB2));
      expect(await store.getEntity(entityKey1, 'reader')).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, 'reader')).toHaveLength(0);
    });

    it('repeated staged creates followed by a single terminate leave the entity non-existent', async () => {
      // The idea of this test is to cover entity creation idempotency
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.terminateEntity(entityKey1, JOB);

      expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
      await expect(store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );
      await expect(store.terminateEntity(entityKey1, JOB)).rejects.toThrow('non-existent entity');

      // Committing the collapsed creates plus the terminate persists nothing.
      await kv.transactionAsync(() => store.commit(JOB));
      expect(await store.getEntity(entityKey1, 'reader')).toBeUndefined();
      expect(await store.getEntities(entityTypeKey, 'reader')).toHaveLength(0);
    });

    it('a staged terminate-then-create makes a committed entity exist again for later ops in the same job', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'recreate-job';
      await store.terminateEntity(entityKey1, JOB2);
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB2);

      await expect(store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB2)).resolves.not.toThrow();
      await expect(store.terminateEntity(entityKey1, JOB2)).resolves.not.toThrow();
    });

    it('recording a fact before its entity is created in the same job is rejected', async () => {
      await expect(store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );

      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
      const staged = await store.getEntities(entityTypeKey, JOB);
      expect(staged).toHaveLength(1);
      expect(staged[0].facts.map(f => f.factTypeId)).toEqual([factTypeA]);
    });
  });

  describe('cross-job behavior', () => {
    it("commit persists only the given job's ops", async () => {
      const payloads = [Fr.random(), Fr.random()];
      await store.createEntity(entityKey1, [], undefined, 'setup-job');
      await kv.transactionAsync(() => store.commit('setup-job'));

      const JOB2 = 'second-job';
      await store.recordFact(entityKey1, factTypeA, [payloads[0]], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [payloads[1]], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only job 1's fact is committed; job 2 still layers its staged fact on top.
      expect((await store.getEntity(entityKey1, 'reader'))!.facts.map(f => f.payload[0])).toEqual([payloads[0]]);
      expect((await store.getEntity(entityKey1, JOB2))!.facts.map(f => f.payload[0])).toEqual(payloads);

      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(entityKey1, 'reader'))!.facts.map(f => f.payload[0])).toEqual(payloads);
    });

    it('a job that has only read still blocks rollback until it is discarded', async () => {
      await store.getEntity(entityKey1, 'reader-job');
      await store.getEntities(entityTypeKey, 'reader-job');
      // A rollback is refused until the job finishes.
      await expect(kv.transactionAsync(() => store.rollback(0))).rejects.toThrow(
        'PXE entity store rollback is not allowed while jobs are running',
      );

      await store.discardStaged('reader-job');
      await expect(kv.transactionAsync(() => store.rollback(0))).resolves.not.toThrow();
    });

    it('a createEntity racing another job to the same key resolves first commit wins', async () => {
      // The staging path inspects only the calling job's ops plus committed state, so two jobs can both stage a create
      // for the same key without seeing each other. On commit the first to land wins; the second is a silent no-op.
      const JOB2 = 'racing-job';
      const firstBody = [Fr.random()];
      await store.createEntity(entityKey1, firstBody, undefined, JOB);
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB2);

      await kv.transactionAsync(() => store.commit(JOB));
      await expect(kv.transactionAsync(() => store.commit(JOB2))).resolves.not.toThrow();

      expect((await store.getEntity(entityKey1, 'reader'))!.body).toEqual(firstBody);
    });

    it('discardStaged drops staged writes without touching committed state', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'discarded-job';
      await store.createEntity(entityKey2, [Fr.random()], undefined, JOB2);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB2);
      await store.discardStaged(JOB2);

      // The discarded writes are gone from the job's own view, and committing the job persists nothing.
      expect(entityIdsOf(await store.getEntities(entityTypeKey, JOB2))).toEqual([entityId1]);
      await kv.transactionAsync(() => store.commit(JOB2));
      expect((await store.getEntity(entityKey1, 'reader'))!.facts).toHaveLength(0);
      expect(await store.getEntity(entityKey2, 'reader')).toBeUndefined();
    });
  });

  describe('isolation', () => {
    it('entities under different scopes are isolated', async () => {
      const scope2 = await AztecAddress.random();
      const keyScope2 = EntityKey.from({ ...entityKey1, scope: scope2 });
      const bodyA = [Fr.random()];
      const bodyScope2 = [Fr.random()];
      await store.createEntity(entityKey1, bodyA, undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
      await store.createEntity(keyScope2, bodyScope2, undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Same contract, type and entity id, but each scope only sees its own entity.
      expect((await store.getEntity(entityKey1, JOB))!.body).toEqual(bodyA);
      expect((await store.getEntity(keyScope2, JOB))!.body).toEqual(bodyScope2);
      expect((await store.getEntity(keyScope2, JOB))!.facts).toHaveLength(0);
      expect(await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, scope: scope2 }), JOB)).toHaveLength(1);

      // Terminating in one scope leaves the other untouched.
      const TERM = 'terminate-job';
      await store.terminateEntity(entityKey1, TERM);
      await kv.transactionAsync(() => store.commit(TERM));
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
      expect(await store.getEntities(EntityTypeKey.from({ ...entityTypeKey, scope: scope2 }), JOB)).toHaveLength(1);
    });

    it('entities under different contracts and entity types are isolated', async () => {
      const contract2 = await AztecAddress.random();
      const ENTITY2 = Fr.random();
      const bodyInScope = [Fr.random()];
      await store.createEntity(entityKey1, bodyInScope, undefined, JOB);
      await store.createEntity(
        EntityKey.from({ ...entityKey1, contractAddress: contract2 }),
        [Fr.random()],
        undefined,
        JOB,
      );
      await store.createEntity(EntityKey.from({ ...entityKey1, entityTypeId: ENTITY2 }), [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const inScope = await store.getEntities(entityTypeKey, JOB);
      expect(inScope).toHaveLength(1);
      expect(inScope[0].body).toEqual(bodyInScope);
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
      await store.createEntity(entityKey1, [], undefined, JOB);
      await store.createEntity(entityKey2, [], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [aPayloads[0]], undefined, JOB);
      await store.recordFact(entityKey2, factTypeA, [bPayloads[0]], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [aPayloads[1]], undefined, JOB);
      await store.recordFact(entityKey2, factTypeA, [bPayloads[1]], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      expect((await store.getEntity(entityKey1, JOB))!.facts.map(f => f.payload[0])).toEqual(aPayloads);
      expect((await store.getEntity(entityKey2, JOB))!.facts.map(f => f.payload[0])).toEqual(bPayloads);
      // getEntities returns the same per-entity order. byId keys on bigint, not Fr: object keys compare by reference.
      const entities = await store.getEntities(entityTypeKey, JOB);
      const byId = new Map(entities.map(e => [e.key.entityId.toBigInt(), e.facts]));
      expect(byId.get(entityId1.toBigInt())!.map(f => f.payload[0])).toEqual(aPayloads);
      expect(byId.get(entityId2.toBigInt())!.map(f => f.payload[0])).toEqual(bPayloads);
    });

    it('creation order is preserved after a prune removes facts from the middle', async () => {
      const first = Fr.random();
      const middle = Fr.random();
      const last = Fr.random();
      await store.createEntity(entityKey1, [], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [first], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [middle], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await store.recordFact(entityKey1, factTypeA, [last], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));

      expect((await store.getEntity(entityKey1, JOB))!.facts.map(f => f.payload[0])).toEqual([first, last]);
    });

    it('facts re-recorded after a terminate take fresh creation positions', async () => {
      const [p1, p2] = [Fr.random(), Fr.random()];
      await store.createEntity(entityKey1, [], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [p1], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [p2], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Terminate wipes the facts; re-recording them in reverse order is a new creation order.
      const JOB2 = 'replay-job';
      await store.terminateEntity(entityKey1, JOB2);
      await store.createEntity(entityKey1, [], undefined, JOB2);
      await store.recordFact(entityKey1, factTypeA, [p2], undefined, JOB2);
      await store.recordFact(entityKey1, factTypeA, [p1], undefined, JOB2);
      await kv.transactionAsync(() => store.commit(JOB2));

      expect((await store.getEntity(entityKey1, JOB))!.facts.map(f => f.payload[0])).toEqual([p2, p1]);
    });

    it('creation order continues across store reopens', async () => {
      const payloads = Array.from({ length: 4 }, () => Fr.random());
      await store.createEntity(entityKey1, [], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [payloads[0]], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [payloads[1]], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // A fresh EntityStore over the same kv store continues the persisted sequence instead of restarting it.
      const reopened = new EntityStore(kv);
      const JOB2 = 'reopened-job';
      await reopened.recordFact(entityKey1, factTypeA, [payloads[2]], undefined, JOB2);
      await reopened.recordFact(entityKey1, factTypeA, [payloads[3]], undefined, JOB2);
      await kv.transactionAsync(() => reopened.commit(JOB2));

      expect((await reopened.getEntity(entityKey1, JOB2))!.facts.map(f => f.payload[0])).toEqual(payloads);
    });
  });

  describe('rollback boundaries and index hygiene', () => {
    it('records originating exactly at the target block survive a rollback', async () => {
      const entityBody = [Fr.random()];
      await store.createEntity(entityKey1, entityBody, { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], { blockNumber: 5, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      // Only records strictly above the target block are pruned.
      await kv.transactionAsync(() => store.rollback(5));
      const { body, facts } = (await store.getEntity(entityKey1, JOB))!;
      expect(body).toEqual(entityBody);
      expect(facts).toHaveLength(1);
      await store.discardStaged(JOB); // discard job so the next rollback isn't blocked

      await kv.transactionAsync(() => store.rollback(4));
      expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
    });

    it('pruning an entity clears the by-block entries of facts below the prune point', async () => {
      // Entity originating at block 6 owning a fact originating at block 4: pruning above 5 deletes the entity
      // wholesale, including the block-4 fact and its index entry.
      await store.createEntity(entityKey1, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], { blockNumber: 4, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      expect(await store.getEntity(entityKey1, JOB)).toBeUndefined();
      await store.discardStaged(JOB); // discard the job so the next rollback isn't blocked

      // A dangling block-4 fact index entry would make this second prune throw "Fact not found".
      await expect(kv.transactionAsync(() => store.rollback(3))).resolves.not.toThrow();
    });

    it('rollback is idempotent', async () => {
      await store.createEntity(entityKey1, [Fr.random()], { blockNumber: 6, blockHash: Fr.random() }, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], { blockNumber: 7, blockHash: Fr.random() }, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      await kv.transactionAsync(() => store.rollback(5));
      await expect(kv.transactionAsync(() => store.rollback(5))).resolves.not.toThrow();
      expect(await store.getEntities(entityTypeKey, JOB)).toHaveLength(0);
    });
  });

  describe('recordFact requires an existing entity', () => {
    it('rejects when the entity exists only as a staged creation on another job', async () => {
      const OTHER = 'other-job';
      await store.createEntity(entityKey1, [Fr.random()], undefined, OTHER);

      // keyA is staged on OTHER, neither visible to this job nor committed, so the record is rejected.
      await expect(store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB)).rejects.toThrow(
        'non-existent entity',
      );
    });

    it('accepts a fact for an entity staged for creation earlier in the same job', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB);
      expect((await store.getEntity(entityKey1, JOB))!.facts).toHaveLength(1);
    });

    it('accepts a fact for an entity already committed to disk', async () => {
      await store.createEntity(entityKey1, [Fr.random()], undefined, JOB);
      await kv.transactionAsync(() => store.commit(JOB));

      const JOB2 = 'record-job';
      await store.recordFact(entityKey1, factTypeA, [Fr.random()], undefined, JOB2);
      expect((await store.getEntity(entityKey1, JOB2))!.facts).toHaveLength(1);
    });
  });
});
