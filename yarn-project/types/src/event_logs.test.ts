import { EventLogs } from './event_logs.js';

describe('EventLogs', () => {
  it('can encode EventLogs to buffer and back', () => {
    const eventLogs = EventLogs.random(42);

    const buffer = eventLogs.toBuffer();
    const recovered = EventLogs.fromBuffer(buffer);

    expect(recovered).toEqual(eventLogs);
  });
});
