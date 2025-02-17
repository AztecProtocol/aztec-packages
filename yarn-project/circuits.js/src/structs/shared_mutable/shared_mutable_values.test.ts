import { Fr } from '@aztec/foundation/fields';

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
});
