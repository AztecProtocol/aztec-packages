import { PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { PrivateLog } from './private_log.js';

describe('PrivateLog', () => {
  let log: PrivateLog;

  beforeAll(() => {
    log = PrivateLog.random();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = log.toBuffer();
    const res = PrivateLog.fromBuffer(buffer);
    expect(res).toEqual(log);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = log.toFields();
    const res = PrivateLog.fromFields(fieldArray);
    expect(res).toEqual(log);
  });

  it('convert to and from json', () => {
    const parsed = PrivateLog.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
  });

  it('number of fields matches constant', () => {
    const fields = log.toFields();
    expect(fields.length * Fr.SIZE_IN_BYTES).toBe(PrivateLog.SIZE_IN_BYTES);
  });

  it('number of emitted fields is correct', () => {
    const smallLogFields = [new Fr(1), new Fr(2), new Fr(3)];
    const smallLog = new PrivateLog(
      padArrayEnd(smallLogFields, Fr.ZERO, PRIVATE_LOG_SIZE_IN_FIELDS),
      smallLogFields.length,
    );
    expect(smallLog.toBlobFields().length).toEqual(smallLogFields.length + 1 /* length */);

    const largeLogFields = Array.from({ length: PRIVATE_LOG_SIZE_IN_FIELDS }, () => Fr.random());
    const largeLog = new PrivateLog(
      padArrayEnd(largeLogFields, Fr.ZERO, PRIVATE_LOG_SIZE_IN_FIELDS),
      largeLogFields.length,
    );
    expect(largeLog.toBlobFields().length).toEqual(largeLogFields.length + 1 /* length */);
  });
});
