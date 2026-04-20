import { VerificationKeyAsFields, VerificationKeyData } from './verification_key.js';

describe('structs/verification_key_as_fields', () => {
  it(`can serialise and deserialise a verification key as fields`, () => {
    const vk = VerificationKeyAsFields.makeFakeHonk();
    const serialised = vk.toBuffer();
    const deserialised = VerificationKeyAsFields.fromBuffer(serialised);
    expect(vk).toEqual(deserialised);
    expect(vk).not.toBe(deserialised);
  });
});

describe('structs/verification_key_data', () => {
  it(`can serialise and deserialise a verification key data`, () => {
    const vk = VerificationKeyData.makeFakeHonk();
    const serialised = vk.toBuffer();
    const deserialised = VerificationKeyData.fromBuffer(serialised);
    expect(vk).toEqual(deserialised);
    expect(vk).not.toBe(deserialised);
  });
});
