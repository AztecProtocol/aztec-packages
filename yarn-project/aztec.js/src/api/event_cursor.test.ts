import { BlockNumber } from '@aztec/foundation/branded-types';
import { LogCursor } from '@aztec/stdlib/logs';

import { EventCursor } from './event_cursor.js';

describe('EventCursor', () => {
  it('round-trips through LogCursor', () => {
    const logCursor = new LogCursor(BlockNumber(7), 3, 2);

    const eventCursor = EventCursor.fromLogCursor(logCursor);

    expect(eventCursor).toEqual(new EventCursor(BlockNumber(7), 3, 2));
    expect(eventCursor.toLogCursor()).toEqual(logCursor);
  });

  it('parses via its schema to an EventCursor instance', () => {
    const parsed = EventCursor.schema.parse({ blockNumber: 7, txIndexWithinBlock: 3, logIndexWithinTx: 2 });

    expect(parsed).toEqual(new EventCursor(BlockNumber(7), 3, 2));
  });

  it('compares by coordinate', () => {
    expect(new EventCursor(BlockNumber(1), 2, 3).equals(new EventCursor(BlockNumber(1), 2, 3))).toBe(true);
    expect(new EventCursor(BlockNumber(1), 2, 3).equals(new EventCursor(BlockNumber(1), 2, 4))).toBe(false);
  });
});
