import { Fr } from '@aztec/foundation/fields';

import { ScheduledValueChange } from './scheduled_value_change.js';

describe('ScheduledValueChange', () => {
  it(`serializes to fields and back`, () => {
    let valueChange = ScheduledValueChange.empty();
    expect(valueChange).toEqual(ScheduledValueChange.fromFields(valueChange.toFields()));

    valueChange = new ScheduledValueChange(new Fr(1), new Fr(2), 27);

    expect(valueChange).toEqual(ScheduledValueChange.fromFields(valueChange.toFields()));
  });
});
