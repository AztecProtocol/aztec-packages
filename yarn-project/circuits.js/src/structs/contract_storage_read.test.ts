import { makeContractStorageRead } from '../tests/factories.js';
import { ContractStorageRead } from './contract_storage_read.js';

describe('ContractStorageRead', () => {
  let read: ContractStorageRead;

  beforeAll(() => {
    const randomInt = Math.floor(Math.random() * 1000);
    read = makeContractStorageRead(randomInt);
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = read.toBuffer();
    const res = ContractStorageRead.fromBuffer(buffer);
    expect(res).toEqual(read);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = read.toFields();
    const res = ContractStorageRead.fromFields(fieldArray);
    expect(res).toEqual(read);
  });
});
