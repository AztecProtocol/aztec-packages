import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityKey } from './entity_store_keys.js';
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

  it('derives stable composite keys including the origin block', () => {
    const nonRetractable = new StoredFact(key, factType, [new Fr(9n)], undefined);
    expect(nonRetractable.entityKey.entityTypeKey().toString()).toBe(`${contract}:${scope}:${entityType}`);
    expect(nonRetractable.entityKey.toString()).toBe(`${contract}:${scope}:${entityType}:${entityId}`);
    expect(factKeyStrOf(nonRetractable)).toBe(
      nonRetractable.entityKey.toString() + `:${factType}:${nonRetractable.payloadHash()}:none`,
    );

    const blockHash = new Fr(0xabcn);
    const retractable = new StoredFact(key, factType, [new Fr(9n)], { blockNumber: 5, blockHash });
    expect(factKeyStrOf(retractable)).toBe(
      retractable.entityKey.toString() + `:${factType}:${retractable.payloadHash()}:5:${blockHash}`,
    );
  });

  it('keys the same payload at different origin blocks as distinct facts', () => {
    const noOrigin = new StoredFact(key, factType, [new Fr(9n)], undefined);
    const atBlock5 = new StoredFact(key, factType, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) });
    const atBlock10 = new StoredFact(key, factType, [new Fr(9n)], { blockNumber: 10, blockHash: new Fr(2n) });
    expect(factKeyStrOf(noOrigin)).not.toBe(factKeyStrOf(atBlock5));
    expect(factKeyStrOf(atBlock5)).not.toBe(factKeyStrOf(atBlock10));
  });

  it('derives distinct payload hashes for distinct payloads', () => {
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
