import { Fr } from '@aztec/foundation/curves/bn254';

import { EphemeralArrayService } from '../ephemeral_array_service.js';
import { EphemeralArray } from '../noir-structs/ephemeral_array.js';
import { EPHEMERAL_ARRAY, FACT, FIELD } from './oracle_type_mappings.js';

describe('FACT type mapping', () => {
  it('serializes a fact to [factTypeId, payloadSlot] with its payload in a nested ephemeral array', () => {
    const service = new EphemeralArrayService();
    const payload = EphemeralArray.fromValues(service, [new Fr(9n), new Fr(8n)]);
    const fact = { factTypeId: new Fr(1n), payload };

    const outer = EphemeralArray.fromValues(service, [fact]);
    const outerSlot = EPHEMERAL_ARRAY(FACT).serialization!.fn(outer).flat()[0];

    const rows = service.readArrayAt(outerSlot);
    expect(rows).toHaveLength(1);
    const [factTypeId, payloadSlot] = rows[0];
    expect(factTypeId).toEqual(new Fr(1n));

    const payloadRows = service.readArrayAt(payloadSlot);
    expect(payloadRows.map(r => r[0])).toEqual([new Fr(9n), new Fr(8n)]);
  });

  it('round-trips a plain field via FIELD (sanity that the test harness wiring is correct)', () => {
    expect(FIELD.serialization!.fn(new Fr(7n))).toEqual([new Fr(7n)]);
  });
});
