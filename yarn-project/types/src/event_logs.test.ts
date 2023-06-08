import { NoirLogs } from './event_logs.js';

describe('NoirLogs', () => {
  it('can encode NoirLogs to buffer and back', () => {
    const unverifiedData = NoirLogs.random(42);

    const buffer = unverifiedData.toBuffer();
    const recovered = NoirLogs.fromBuffer(buffer);

    expect(recovered).toEqual(unverifiedData);
  });
});
