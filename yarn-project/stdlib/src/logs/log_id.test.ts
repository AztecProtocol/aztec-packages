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

  it('toString and fromString works', () => {
    const str = logId.toString();
    const parsedLogId = LogId.fromString(str);

    expect(parsedLogId).toEqual(logId);
  });

  it('human readable string includes block hash', () => {
    const human = logId.toHumanReadable();

    expect(human).toContain(logId.blockHash.toString());
  });
});
