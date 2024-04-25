import { VerificationKeyAsFields } from './verification_key.js';

describe('structs/verification_key', () => {
  it(`can serialise and deserialise a verification key`, () => {
    const vk = VerificationKeyAsFields.makeFake();
    const serialised = vk.toBuffer();
    const deserialised = VerificationKeyAsFields.fromBuffer(serialised);
    expect(vk).toEqual(deserialised);
    expect(vk).not.toBe(deserialised);
  });
});
