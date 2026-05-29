import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { CanonicalityCheck } from '../foundation/origin_read.js';
import { FactStore } from './fact_store.js';

describe('FactStore', () => {
  const ENTITY = new Fr(1n);
  const FACT_A = new Fr(10n);
  const correlation = Buffer.from('correlation-key-1');

  const contractA = AztecAddress.fromBigInt(100n);
  const contractB = AztecAddress.fromBigInt(200n);
  const scopeX = AztecAddress.fromBigInt(1n);
  const scopeY = AztecAddress.fromBigInt(2n);

  // Tests stage all writes against this jobId. Reads from the same jobId observe the staged state.
  const JOB = 'fact-store-test-job';

  let store: FactStore;
  let canonical: Set<string>;

  const chain: CanonicalityCheck = {
    isCanonical: a => Promise.resolve(canonical.has(`${a.blockNumber}:${a.blockHash}`)),
  };

  beforeEach(async () => {
    canonical = new Set();
    store = new FactStore(await openTmpStore('fact-store-test'), chain);
  });

  const factTypes = (facts: { factType: Fr }[]) => facts.map(f => f.factType.toString()).sort();

  it('returns a non-retractable fact unconditionally', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null, JOB);

    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB);

    expect(factTypes(facts)).toEqual([FACT_A.toString()]);
    expect(facts[0].origin).toBeNull();
  });

  it('dedups byte-identical facts to a single row', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null, JOB);
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null, JOB);

    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB);

    expect(facts).toHaveLength(1);
  });

  it('stores and reads back a large payload (e.g. an offchain Received fact)', async () => {
    // An offchain `Received` fact packs 20 fields (640 bytes), whose hex inlined into the dedup key would exceed the
    // LMDB DUPSORT value-size limit. The dedup key must stay bounded regardless of payload size.
    const largePayload = Buffer.concat(Array.from({ length: 20 }, () => new Fr(0x1234n).toBuffer()));
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, largePayload, null, JOB);
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, largePayload, null, JOB);

    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB);

    expect(facts).toHaveLength(1);
    expect(facts[0].payload).toEqual(largePayload);
  });

  it('hides a retractable fact whose block is not canonical, shows it when it is', async () => {
    const origin = { blockNumber: 105, blockHash: '0xaa' };
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.alloc(0), origin, JOB);

    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB)).toHaveLength(0);

    canonical.add('105:0xaa');
    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB);
    expect(factTypes(facts)).toEqual([FACT_A.toString()]);
    expect(facts[0].origin).toEqual(origin);
  });

  it('keeps competing-fork facts as distinct rows and returns only the canonical one', async () => {
    await store.put(
      contractA,
      scopeX,
      ENTITY,
      FACT_A,
      correlation,
      Buffer.from('same'),
      {
        blockNumber: 105,
        blockHash: '0xaa',
      },
      JOB,
    );
    await store.put(
      contractA,
      scopeX,
      ENTITY,
      FACT_A,
      correlation,
      Buffer.from('same'),
      {
        blockNumber: 105,
        blockHash: '0xbb',
      },
      JOB,
    );

    canonical.add('105:0xbb');
    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB);

    expect(facts).toHaveLength(1);
    expect(facts[0].origin).toEqual({ blockNumber: 105, blockHash: '0xbb' });
  });

  it('enumerates active entities for (contract, scope, entityType), deduped', async () => {
    const corr2 = Buffer.from('correlation-key-2');
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null, JOB);
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a2'), null, JOB); // same entity, 2nd fact
    await store.put(contractA, scopeX, ENTITY, FACT_A, corr2, Buffer.from('b'), null, JOB);

    const active = await store.activeEntities(contractA, scopeX, ENTITY, JOB);
    expect(active.map(b => b.toString('hex')).sort()).toEqual([correlation, corr2].map(b => b.toString('hex')).sort());
    expect(await store.activeEntities(contractB, scopeX, ENTITY, JOB)).toEqual([]);
  });

  it('excludes terminated entities from active enumeration', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null, JOB);
    expect(await store.isTerminated(contractA, scopeX, ENTITY, correlation, JOB)).toBe(false);

    await store.terminate(contractA, scopeX, ENTITY, correlation, JOB);

    expect(await store.isTerminated(contractA, scopeX, ENTITY, correlation, JOB)).toBe(true);
    expect(await store.activeEntities(contractA, scopeX, ENTITY, JOB)).toEqual([]);
    // facts themselves are still stored (terminate is a marker, not a delete):
    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB)).toHaveLength(1);
  });

  it('isolates facts by (contract, scope)', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null, JOB);

    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB)).toHaveLength(1);
    expect(await store.loadCanonicalFactSet(contractB, scopeX, ENTITY, correlation, JOB)).toHaveLength(0);
    expect(await store.loadCanonicalFactSet(contractA, scopeY, ENTITY, correlation, JOB)).toHaveLength(0);

    await store.put(contractB, scopeX, ENTITY, FACT_A, correlation, Buffer.from('b'), null, JOB);
    expect(await store.loadCanonicalFactSet(contractB, scopeX, ENTITY, correlation, JOB)).toHaveLength(1);
    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, JOB)).toHaveLength(1); // unchanged
  });

  describe('staging', () => {
    it('promotes staged writes to KV storage on commit, so they survive jobId rotation', async () => {
      await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null, JOB);
      await store.commit(JOB);
      // A fresh jobId (no staging) still sees the committed fact.
      const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, 'another-job');
      expect(facts).toHaveLength(1);
    });

    it('drops staged writes on discardStaged, so they never reach KV storage', async () => {
      await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null, JOB);
      await store.discardStaged(JOB);
      const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, 'another-job');
      expect(facts).toHaveLength(0);
    });

    it("does not leak one job's staged writes into another job's reads", async () => {
      await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null, JOB);
      const otherJobView = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation, 'other-job');
      expect(otherJobView).toHaveLength(0);
    });
  });
});
