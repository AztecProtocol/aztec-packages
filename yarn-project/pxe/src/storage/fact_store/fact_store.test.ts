import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { CanonicalityCheck } from '../foundation/anchored_read.js';
import { FactStore } from './fact_store.js';

describe('FactStore', () => {
  const ENTITY = new Fr(1n);
  const FACT_A = new Fr(10n);
  const correlation = Buffer.from('correlation-key-1');

  const contractA = AztecAddress.fromBigInt(100n);
  const contractB = AztecAddress.fromBigInt(200n);
  const scopeX = AztecAddress.fromBigInt(1n);
  const scopeY = AztecAddress.fromBigInt(2n);

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
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null);

    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation);

    expect(factTypes(facts)).toEqual([FACT_A.toString()]);
    expect(facts[0].anchor).toBeNull();
  });

  it('dedups byte-identical facts to a single row', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null);
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('payload-a'), null);

    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation);

    expect(facts).toHaveLength(1);
  });

  it('hides an anchored fact whose block is not canonical, shows it when it is', async () => {
    const anchor = { blockNumber: 105, blockHash: '0xaa' };
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.alloc(0), anchor);

    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation)).toHaveLength(0);

    canonical.add('105:0xaa');
    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation);
    expect(factTypes(facts)).toEqual([FACT_A.toString()]);
    expect(facts[0].anchor).toEqual(anchor);
  });

  it('keeps competing-fork facts as distinct rows and returns only the canonical one', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('same'), {
      blockNumber: 105,
      blockHash: '0xaa',
    });
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('same'), {
      blockNumber: 105,
      blockHash: '0xbb',
    });

    canonical.add('105:0xbb');
    const facts = await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation);

    expect(facts).toHaveLength(1);
    expect(facts[0].anchor).toEqual({ blockNumber: 105, blockHash: '0xbb' });
  });

  it('isolates facts by (contract, scope)', async () => {
    await store.put(contractA, scopeX, ENTITY, FACT_A, correlation, Buffer.from('a'), null);

    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation)).toHaveLength(1);
    expect(await store.loadCanonicalFactSet(contractB, scopeX, ENTITY, correlation)).toHaveLength(0);
    expect(await store.loadCanonicalFactSet(contractA, scopeY, ENTITY, correlation)).toHaveLength(0);

    await store.put(contractB, scopeX, ENTITY, FACT_A, correlation, Buffer.from('b'), null);
    expect(await store.loadCanonicalFactSet(contractB, scopeX, ENTITY, correlation)).toHaveLength(1);
    expect(await store.loadCanonicalFactSet(contractA, scopeX, ENTITY, correlation)).toHaveLength(1); // unchanged
  });
});
