import { SerializableContractInstance, SerializableContractInstancePreimage } from './contract_instance.js';

describe('ContractInstance', () => {
  it('can serialize and deserialize an instance', async () => {
    const instance = await SerializableContractInstance.random();
    expect(SerializableContractInstance.fromBuffer(instance.toBuffer())).toEqual(instance);
  });
});

describe('ContractInstancePreimage', () => {
  it('round-trips the preimage layout', async () => {
    const instance = await SerializableContractInstance.random();
    const preimage = new SerializableContractInstancePreimage(instance);
    expect(SerializableContractInstancePreimage.fromBuffer(preimage.toBuffer())).toEqual(preimage);
  });
});
