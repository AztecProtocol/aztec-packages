import { ScheduledDelayChange } from './scheduled_delay_change.js';

describe('ScheduledDelayChange', () => {
  it(`serializes to field and back`, () => {
    let delayChange = ScheduledDelayChange.empty();
    expect(delayChange).toEqual(ScheduledDelayChange.fromField(delayChange.toField()));

    delayChange = new ScheduledDelayChange(undefined, 1, 2);
    expect(delayChange).toEqual(ScheduledDelayChange.fromField(delayChange.toField()));

    delayChange = new ScheduledDelayChange(3, 4, undefined);
    expect(delayChange).toEqual(ScheduledDelayChange.fromField(delayChange.toField()));

    delayChange = new ScheduledDelayChange(5, 6, 7);
    expect(delayChange).toEqual(ScheduledDelayChange.fromField(delayChange.toField()));
  });
});
