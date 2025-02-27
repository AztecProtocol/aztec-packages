import { CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import { ContractClassLog } from './contract_class_log.js';

describe('PublicLog', () => {
  let log: ContractClassLog;

  beforeAll(async () => {
    log = await ContractClassLog.random();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = log.toBuffer();
    const res = ContractClassLog.fromBuffer(buffer);
    expect(res).toEqual(log);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = log.toFields();
    const res = ContractClassLog.fromFields(fieldArray);
    expect(res).toEqual(log);
  });

  it('number of fields matches constant', () => {
    const fields = log.toFields();
    expect(fields.length).toBe(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS);
  });

  it('number of emitted fields is correct', () => {
    const smallLogFields = [new Fr(1), new Fr(2), new Fr(3)];
    const smallLog = new ContractClassLog(
      AztecAddress.fromField(Fr.ONE),
      smallLogFields.concat(new Array(CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS - smallLogFields.length).fill(Fr.ZERO)),
    );
    expect(smallLog.getEmittedFields()).toEqual(smallLogFields);
    expect(smallLog.getEmittedLength()).toBe(smallLogFields.length);

    const largeLogFields = Array.from({ length: CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS - smallLogFields.length }, () =>
      Fr.random(),
    );
    const largeLog = new ContractClassLog(
      AztecAddress.fromField(Fr.ONE),
      largeLogFields.concat(new Array(smallLogFields.length).fill(Fr.ZERO)),
    );
    expect(largeLog.getEmittedFields()).toEqual(largeLogFields);
    expect(largeLog.getEmittedLength()).toBe(largeLogFields.length);
  });
});
