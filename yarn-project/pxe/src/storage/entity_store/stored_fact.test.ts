import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StoredEntity, StoredFact, entityKeyOf, factRowKeyOf, scopeKeyOf } from './stored_fact.js';

describe('StoredFact', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const entityType = new Fr(7n);
  const entityId = new Fr(42n);
  const factType = new Fr(3n);

  it('round-trips a retractable fact through buffer serialization', () => {
    const fact = new StoredFact(contract, scope, entityType, entityId, factType, [new Fr(9n), new Fr(10n)], {
      blockNumber: 12,
      blockHash: new Fr(0xabcn),
    });
    const back = StoredFact.fromBuffer(fact.toBuffer());
    expect(back).toEqual(fact);
    expect(back.isRetractable).toBe(true);
  });

  it('round-trips a non-retractable fact (no anchor)', () => {
    const fact = new StoredFact(contract, scope, entityType, entityId, factType, [new Fr(9n)], undefined);
    const back = StoredFact.fromBuffer(fact.toBuffer());
    expect(back).toEqual(fact);
    expect(back.isRetractable).toBe(false);
  });

  it('derives stable composite keys', () => {
    const fact = new StoredFact(contract, scope, entityType, entityId, factType, [new Fr(9n)], undefined);
    expect(scopeKeyOf(fact)).toBe(`${contract}:${scope}:${entityType}`);
    expect(entityKeyOf(fact)).toBe(`${contract}:${scope}:${entityType}:${entityId}`);
    expect(factRowKeyOf(fact)).toBe(entityKeyOf(fact) + `:${factType}:${fact.payloadHash()}`);
  });

  it('gives distinct payload hashes for distinct payloads and equal for equal', () => {
    const a = new StoredFact(contract, scope, entityType, entityId, factType, [new Fr(1n)], undefined);
    const b = new StoredFact(contract, scope, entityType, entityId, factType, [new Fr(2n)], undefined);
    const c = new StoredFact(contract, scope, entityType, entityId, factType, [new Fr(1n)], undefined);
    expect(a.payloadHash()).not.toEqual(b.payloadHash());
    expect(a.payloadHash()).toEqual(c.payloadHash());
  });
});

describe('StoredEntity', () => {
  const contract = AztecAddress.fromBigInt(100n);
  const scope = AztecAddress.fromBigInt(1n);
  const entityType = new Fr(7n);
  const entityId = new Fr(42n);

  it('round-trips a retractable entity through buffer serialization', () => {
    const entity = new StoredEntity(contract, scope, entityType, entityId, [new Fr(9n), new Fr(10n)], {
      blockNumber: 12,
      blockHash: new Fr(0xabcn),
    });
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.isRetractable).toBe(true);
  });

  it('round-trips a non-retractable entity (no anchor)', () => {
    const entity = new StoredEntity(contract, scope, entityType, entityId, [new Fr(9n)], undefined);
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.isRetractable).toBe(false);
  });

  it('round-trips an entity with an empty payload', () => {
    const entity = new StoredEntity(contract, scope, entityType, entityId, [], undefined);
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.payload).toEqual([]);
  });
});
