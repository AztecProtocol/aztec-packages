import { SerializableContractInstanceUpdate } from './contract_instance_update.js';

describe('ContractInstance', () => {
  it('can serialize and deserialize an instance update', () => {
    const instance = SerializableContractInstanceUpdate.random();
    expect(SerializableContractInstanceUpdate.fromBuffer(instance.toBuffer())).toEqual(instance);
  });
});
