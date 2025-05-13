import { PUBLIC_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

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

  it('convert to and from json', () => {
    const parsed = PublicLog.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
  });

  it('number of fields matches constant', () => {
    const fields = log.toFields();
    expect(fields.length * Fr.SIZE_IN_BYTES).toBe(PublicLog.SIZE_IN_BYTES);
  });

  it('number of emitted fields is correct', async () => {
    const address = await AztecAddress.random();
    const smallLogFields = [new Fr(1), new Fr(2), new Fr(3)];
    const smallLog = new PublicLog(
      address,
      padArrayEnd(smallLogFields, Fr.ZERO, PUBLIC_LOG_SIZE_IN_FIELDS),
      smallLogFields.length,
    );
    expect(smallLog.toBlobFields().length).toEqual(smallLogFields.length + 1 /* length */ + 1 /* contract address */);

    const largeLogFields = Array.from({ length: PUBLIC_LOG_SIZE_IN_FIELDS }, () => Fr.random());
    const largeLog = new PublicLog(
      address,
      padArrayEnd(largeLogFields, Fr.ZERO, PUBLIC_LOG_SIZE_IN_FIELDS),
      largeLogFields.length,
    );
    expect(largeLog.toBlobFields().length).toEqual(largeLogFields.length + 1 /* length */ + 1 /* contract address */);
  });
});
