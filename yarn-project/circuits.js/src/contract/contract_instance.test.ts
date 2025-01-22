import { SerializableContractInstance } from './contract_instance.js';

describe('ContractInstance', () => {
  it('can serialize and deserialize an instance', async () => {
    const instance = await SerializableContractInstance.random();
    expect(SerializableContractInstance.fromBuffer(instance.toBuffer())).toEqual(instance);
  });
});
