import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { StoredEntity } from './stored_entity.js';

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

  it('round-trips a non-retractable entity (no origin block)', () => {
    const entity = new StoredEntity(contract, scope, entityType, entityId, [new Fr(9n)], undefined);
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.isRetractable).toBe(false);
  });

  it('round-trips an entity with an empty body', () => {
    const entity = new StoredEntity(contract, scope, entityType, entityId, [], undefined);
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.body).toEqual([]);
  });
});
