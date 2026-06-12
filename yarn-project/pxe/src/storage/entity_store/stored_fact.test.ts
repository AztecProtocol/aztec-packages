import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityKey } from './entity_keys.js';
import { StoredFact, deserializeFact, factKeyStrOf, serializeFact } from './stored_fact.js';

describe('StoredFact', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const entityType = new Fr(7n);
  const entityId = new Fr(42n);
  const factType = new Fr(3n);
  const key = EntityKey.from({ contractAddress: contract, scope, entityTypeId: entityType, entityId });

  it('round-trips a retractable fact through buffer serialization', () => {
    const fact = new StoredFact(key, factType, [new Fr(9n), new Fr(10n)], {
      blockNumber: 12,
      blockHash: new Fr(0xabcn),
    });
    const back = StoredFact.fromBuffer(fact.toBuffer());
    expect(back).toEqual(fact);
    expect(back.isRetractable).toBe(true);
  });

  it('round-trips a non-retractable fact (no origin block)', () => {
    const fact = new StoredFact(key, factType, [new Fr(9n)], undefined);
    const back = StoredFact.fromBuffer(fact.toBuffer());
    expect(back).toEqual(fact);
    expect(back.isRetractable).toBe(false);
  });

  it('derives stable composite keys', () => {
    const fact = new StoredFact(key, factType, [new Fr(9n)], undefined);
    expect(fact.key.scopeKey().toString()).toBe(`${contract}:${scope}:${entityType}`);
    expect(fact.key.toString()).toBe(`${contract}:${scope}:${entityType}:${entityId}`);
    expect(factKeyStrOf(fact)).toBe(fact.key.toString() + `:${factType}:${fact.payloadHash()}`);
  });

  it('gives distinct payload hashes for distinct payloads and equal for equal', () => {
    const a = new StoredFact(key, factType, [new Fr(1n)], undefined);
    const b = new StoredFact(key, factType, [new Fr(2n)], undefined);
    const c = new StoredFact(key, factType, [new Fr(1n)], undefined);
    expect(a.payloadHash()).not.toEqual(b.payloadHash());
    expect(a.payloadHash()).toEqual(c.payloadHash());
  });

  it('round-trips a stored fact with its sequence number', () => {
    const fact = new StoredFact(key, factType, [new Fr(9n)], {
      blockNumber: 12,
      blockHash: new Fr(0xabcn),
    });
    for (const seq of [0, 1, 2 ** 32 - 1]) {
      const back = deserializeFact(serializeFact(seq, fact));
      expect(back.seq).toBe(seq);
      expect(back.fact).toEqual(fact);
    }
  });
});
