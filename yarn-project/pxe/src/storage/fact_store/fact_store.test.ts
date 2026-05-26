import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import type { CanonicalityCheck } from '../foundation/anchored_read.js';
import { FactStore } from './fact_store.js';

describe('FactStore', () => {
  const ENTITY = new Fr(1n);
  const FACT_A = new Fr(10n);
  const correlation = Buffer.from('correlation-key-1');

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

  it('returns an unanchored fact unconditionally', async () => {
    await store.put(ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null);

    const facts = await store.loadCanonicalFactSet(ENTITY, correlation);

    expect(factTypes(facts)).toEqual([FACT_A.toString()]);
    expect(facts[0].anchor).toBeNull();
  });

  it('dedups byte-identical facts to a single row', async () => {
    await store.put(ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null);
    await store.put(ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null);

    const facts = await store.loadCanonicalFactSet(ENTITY, correlation);

    expect(facts).toHaveLength(1);
  });

  it('hides an anchored fact whose block is not canonical, shows it when it is', async () => {
    const anchor = { blockNumber: 105, blockHash: '0xaa' };
    await store.put(ENTITY, FACT_A, correlation, Buffer.alloc(0), anchor);

    expect(await store.loadCanonicalFactSet(ENTITY, correlation)).toHaveLength(0);

    canonical.add('105:0xaa');
    const facts = await store.loadCanonicalFactSet(ENTITY, correlation);
    expect(factTypes(facts)).toEqual([FACT_A.toString()]);
    expect(facts[0].anchor).toEqual(anchor);
  });

  it('keeps competing-fork facts as distinct rows and returns only the canonical one', async () => {
    await store.put(ENTITY, FACT_A, correlation, Buffer.from('same'), { blockNumber: 105, blockHash: '0xaa' });
    await store.put(ENTITY, FACT_A, correlation, Buffer.from('same'), { blockNumber: 105, blockHash: '0xbb' });

    canonical.add('105:0xbb');
    const facts = await store.loadCanonicalFactSet(ENTITY, correlation);

    expect(facts).toHaveLength(1);
    expect(facts[0].anchor).toEqual({ blockNumber: 105, blockHash: '0xbb' });
  });
});
