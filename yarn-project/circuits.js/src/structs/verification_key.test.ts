import { VerificationKey } from './verification_key.js';

describe('structs/verification_key', () => {
  it(`can serialise and deserialise a verification key`, () => {
    const vk = VerificationKey.makeFake();
    const serialised = vk.toBuffer();
    const deserialised = VerificationKey.fromBuffer(serialised);
    expect(vk).toEqual(deserialised);
    expect(vk).not.toBe(deserialised);
  });
});
