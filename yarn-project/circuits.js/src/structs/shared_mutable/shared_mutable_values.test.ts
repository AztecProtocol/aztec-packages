import { Fr } from '@aztec/foundation/fields';
import { updateInlineTestData } from '@aztec/foundation/testing/files';

import { ScheduledDelayChange } from './scheduled_delay_change.js';
import { ScheduledValueChange } from './scheduled_value_change.js';
import { SharedMutableValues } from './shared_mutable_values.js';

describe('SharedMutableValues', () => {
  it(`serializes to fields and back`, () => {
    let values = SharedMutableValues.empty(1);
    expect(values).toEqual(SharedMutableValues.fromFields(values.toFields()));

    values = new SharedMutableValues(
      new ScheduledValueChange([new Fr(1)], [new Fr(2)], 27),
      new ScheduledDelayChange(undefined, 1, 2),
    );
    expect(values).toEqual(SharedMutableValues.fromFields(values.toFields()));

    values = new SharedMutableValues(
      new ScheduledValueChange([new Fr(3)], [new Fr(4)], 28),
      new ScheduledDelayChange(3, 4, undefined),
    );
    expect(values).toEqual(SharedMutableValues.fromFields(values.toFields()));

    values = new SharedMutableValues(
      new ScheduledValueChange([new Fr(5)], [new Fr(6)], 29),
      new ScheduledDelayChange(5, 6, 7),
    );
    expect(values).toEqual(SharedMutableValues.fromFields(values.toFields()));
  });

  it('packed shared mutable values match Noir', () => {
    const values = new SharedMutableValues(
      new ScheduledValueChange([new Fr(1), new Fr(2)], [new Fr(3), new Fr(4)], 50),
      new ScheduledDelayChange(1, 2, 50),
    );

    const packed = values.toFields();
    const packedStr = `[${packed.map(f => f.toString()).join(',')}]`;

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/shared_mutable/shared_mutable_values/test.nr',
      'packed_smv_from_typescript',
      packedStr,
    );
  });
});
