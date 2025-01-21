import { PUBLIC_LOG_SIZE_IN_FIELDS } from '../constants.gen.js';
import { PublicLog } from './public_log.js';

describe('PublicLog', () => {
  let log: PublicLog;

  beforeAll(() => {
    log = PublicLog.random();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = log.toBuffer();
    const res = PublicLog.fromBuffer(buffer);
    expect(res).toEqual(log);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = log.toFields();
    const res = PublicLog.fromFields(fieldArray);
    expect(res).toEqual(log);
  });

  it('number of fields matches constant', () => {
    const fields = log.toFields();
    expect(fields.length).toBe(PUBLIC_LOG_SIZE_IN_FIELDS);
  });
});
