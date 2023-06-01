import { EventLogs } from './event_logs.js';

describe('EventLogs', () => {
  it('can encode EventLogs to buffer and back', () => {
    const unverifiedData = EventLogs.random(42);

    const buffer = unverifiedData.toBuffer();
    const recovered = EventLogs.fromBuffer(buffer);

    expect(recovered).toEqual(unverifiedData);
  });
});
