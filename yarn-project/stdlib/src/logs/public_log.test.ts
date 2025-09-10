import { PUBLIC_LOGS_HEADER_LENGTH, PUBLIC_LOG_HEADER_LENGTH } from '@aztec/constants';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { PublicLog, PublicLogs } from './public_log.js';

describe('PublicLog', () => {
  let log: PublicLog;

  beforeAll(async () => {
    log = await PublicLog.random();
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

  it('convert to and from json', () => {
    const parsed = PublicLog.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
  });

  it('calculates size in fields correctly', () => {
    const expectedSize = log.fields.length + PUBLIC_LOG_HEADER_LENGTH; // fields length + contract address field + fields length field
    expect(log.sizeInFields()).toBe(expectedSize);
  });
});

describe('PublicLogs', () => {
  let logs: PublicLogs;
  let emptyLogs: PublicLogs;

  beforeAll(async () => {
    const log1 = await PublicLog.random();
    const log2 = await PublicLog.random();
    const log3 = await PublicLog.random();
    logs = new PublicLogs([log1, log2, log3]);
    emptyLogs = PublicLogs.empty();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = logs.toBuffer();
    const res = PublicLogs.fromBuffer(buffer);
    expect(res).toEqual(logs);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = logs.toFields();
    const res = PublicLogs.fromFields(fieldArray);
    expect(res).toEqual(logs);
  });

  it('convert to and from json', () => {
    const parsed = PublicLogs.schema.parse(JSON.parse(jsonStringify(logs)));
    expect(parsed).toEqual(logs);
  });

  it('handles empty logs correctly', () => {
    expect(emptyLogs.isEmpty()).toBe(true);
    expect(emptyLogs.logs).toEqual([]);

    const buffer = emptyLogs.toBuffer();
    const res = PublicLogs.fromBuffer(buffer);
    expect(res).toEqual(emptyLogs);
  });

  it('calculates size in fields correctly', () => {
    const expectedSize = PUBLIC_LOGS_HEADER_LENGTH + logs.logs.reduce((acc, log) => acc + log.sizeInFields(), 0); // 1 for length field
    expect(logs.sizeInFields()).toBe(expectedSize);
  });

  it('flattens logs correctly', () => {
    const flattened = logs.flattenLogs();
    const expected = logs.logs.flatMap(log => log.toFields());
    expect(flattened).toEqual(expected);
  });
});
