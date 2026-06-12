import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { EntityKey } from './entity_keys.js';
import { StoredEntity } from './stored_entity.js';

describe('StoredEntity', () => {
  const key = EntityKey.from({
    contractAddress: AztecAddress.fromBigInt(100n),
    scope: AztecAddress.fromBigInt(1n),
    entityTypeId: new Fr(7n),
    entityId: new Fr(42n),
  });

  it('round-trips a retractable entity through buffer serialization', () => {
    const entity = new StoredEntity(key, [new Fr(9n), new Fr(10n)], {
      blockNumber: 12,
      blockHash: new Fr(0xabcn),
    });
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.isRetractable).toBe(true);
  });

  it('round-trips a non-retractable entity (no origin block)', () => {
    const entity = new StoredEntity(key, [new Fr(9n)], undefined);
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.isRetractable).toBe(false);
  });

  it('round-trips an entity with an empty body', () => {
    const entity = new StoredEntity(key, [], undefined);
    const back = StoredEntity.fromBuffer(entity.toBuffer());
    expect(back).toEqual(entity);
    expect(back.body).toEqual([]);
  });
});
