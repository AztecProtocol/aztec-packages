import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { AztecAddress } from '../aztec-address/index.js';
import { ContractClassLog, ContractClassLogFields } from './contract_class_log.js';

describe('ContractClassLog', () => {
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

  it('convert to and from json', () => {
    const parsed = ContractClassLog.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
  });

  it('number of fields matches constant', () => {
    const fields = log.toFields();
    expect(fields.length * Fr.SIZE_IN_BYTES).toBe(ContractClassLog.SIZE_IN_BYTES);
  });

  it('number of emitted blob fields is correct', () => {
    const smallLogFields = [new Fr(1), new Fr(2), new Fr(3)];
    const smallLog = new ContractClassLog(
      AztecAddress.fromField(Fr.ONE),
      ContractClassLogFields.fromEmittedFields(smallLogFields),
      smallLogFields.length,
    );
    expect(smallLog.toBlobFields().length).toEqual(smallLogFields.length + 1 /* length */ + 1 /* contract address */);

    const largeLogFields = Array.from({ length: CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - smallLogFields.length }, () =>
      Fr.random(),
    );
    const largeLog = new ContractClassLog(
      AztecAddress.fromField(Fr.ONE),
      ContractClassLogFields.fromEmittedFields(largeLogFields),
      largeLogFields.length,
    );
    expect(largeLog.toBlobFields().length).toEqual(largeLogFields.length + 1 /* length */ + 1 /* contract address */);
  });
});
