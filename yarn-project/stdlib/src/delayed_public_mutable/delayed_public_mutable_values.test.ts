import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { DelayedPublicMutableValues } from './delayed_public_mutable_values.js';
import { ScheduledDelayChange } from './scheduled_delay_change.js';
import { ScheduledValueChange } from './scheduled_value_change.js';

describe('DelayedPublicMutableValues', () => {
  it(`serializes to fields and back`, () => {
    let values = DelayedPublicMutableValues.empty(1);
    expect(values).toEqual(DelayedPublicMutableValues.fromFields(values.toFields()));

    values = new DelayedPublicMutableValues(
      new ScheduledValueChange([new Fr(1)], [new Fr(2)], 27n),
      new ScheduledDelayChange(undefined, 2n, 1n),
    );
    expect(values).toEqual(DelayedPublicMutableValues.fromFields(values.toFields()));

    values = new DelayedPublicMutableValues(
      new ScheduledValueChange([new Fr(3)], [new Fr(4)], 28n),
      new ScheduledDelayChange(3n, undefined, 4n),
    );
    expect(values).toEqual(DelayedPublicMutableValues.fromFields(values.toFields()));

    values = new DelayedPublicMutableValues(
      new ScheduledValueChange([new Fr(5)], [new Fr(6)], 29n),
      new ScheduledDelayChange(5n, 7n, 6n),
    );
    expect(values).toEqual(DelayedPublicMutableValues.fromFields(values.toFields()));
  });

  it('packed delayed public mutable values match Noir', () => {
    const values = new DelayedPublicMutableValues(
      new ScheduledValueChange([new Fr(1), new Fr(2)], [new Fr(3), new Fr(4)], 50n),
      new ScheduledDelayChange(1n, 50n, 2n),
    );

    const packed = values.toFields();
    const packedStr = `[${packed.map(f => f.toString()).join(',')}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/delayed_public_mutable/delayed_public_mutable_values/test.nr',
      'packed_dpmv_from_typescript',
      packedStr,
    );
  });
});
