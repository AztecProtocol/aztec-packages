import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';

import { deriveSecretKeyFromSigningKey } from './key_derivation.js';

describe('deriveSecretKeyFromSigningKey', () => {
  it('derives a deterministic, signing-key-specific secret key', async () => {
    const signingKey = GrumpkinScalar.fromHexString('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    const secretKey = await deriveSecretKeyFromSigningKey(signingKey);
    // The value feeds the account address, so it is locked here to catch any silent change to the derivation.
    expect(secretKey.toString()).toEqual('0x21a8894e479037a29ac0dfd569f9adab7fa4a2a215f7f1884b30df383e54b55b');

    expect((await deriveSecretKeyFromSigningKey(signingKey)).toString()).toEqual(secretKey.toString());
    const otherSigningKey = GrumpkinScalar.fromHexString(
      '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e',
    );
    expect((await deriveSecretKeyFromSigningKey(otherSigningKey)).toString()).not.toEqual(secretKey.toString());
  });
});
