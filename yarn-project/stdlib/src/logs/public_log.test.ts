import { PUBLIC_LOG_DATA_SIZE_IN_FIELDS, PUBLIC_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import { PublicLog } from './public_log.js';

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

  it('number of fields matches constant', () => {
    const fields = log.toFields();
    expect(fields.length).toBe(PUBLIC_LOG_SIZE_IN_FIELDS);
  });

  it('number of emitted fields is correct', () => {
    const smallLogFields = [new Fr(1), new Fr(2), new Fr(3)];
    const smallLog = new PublicLog(
      AztecAddress.fromField(Fr.ONE),
      padArrayEnd(smallLogFields, Fr.ZERO, PUBLIC_LOG_DATA_SIZE_IN_FIELDS),
    );
    // The address is always part of the log, throughout kernels and rollup circuits
    const expectedSmall = [Fr.ONE].concat(smallLogFields);
    expect(smallLog.getEmittedFields()).toEqual(expectedSmall);
    expect(smallLog.getEmittedLength()).toBe(expectedSmall.length);

    const largeLogFields = Array.from({ length: PUBLIC_LOG_DATA_SIZE_IN_FIELDS }, () => Fr.random());
    const largeLog = new PublicLog(
      AztecAddress.fromField(Fr.ONE),
      padArrayEnd(largeLogFields, Fr.ZERO, PUBLIC_LOG_DATA_SIZE_IN_FIELDS),
    );
    const expectedLarge = [Fr.ONE].concat(largeLogFields);
    expect(largeLog.getEmittedFields()).toEqual(expectedLarge);
    expect(largeLog.getEmittedLength()).toBe(expectedLarge.length);
  });
});
