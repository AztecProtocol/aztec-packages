import { LogId } from './log_id.js';

describe('LogId', () => {
  let logId: LogId;
  beforeEach(() => {
    logId = LogId.random();
  });

  it('toBuffer and fromBuffer works', () => {
    const buffer = logId.toBuffer();
    const parsedLogId = LogId.fromBuffer(buffer);

    expect(parsedLogId).toEqual(logId);
  });

  it('toBuffer and fromBuffer works', () => {
    const buffer = logId.toBuffer();
    const parsedLogId = LogId.fromBuffer(buffer);

    expect(parsedLogId).toEqual(logId);
  });
});
