import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';

import { Schnorr } from './index.js';

describe('schnorr', () => {
  let schnorr!: Schnorr;

  beforeAll(() => {
    schnorr = new Schnorr();
  });

  it('should verify signature', async () => {
    // prettier-ignore
    const privateKey = GrumpkinScalar.fromBuffer(Buffer.from([
      0x0b, 0x9b, 0x3a, 0xde, 0xe6, 0xb3, 0xd8, 0x1b, 0x28, 0xa0, 0x88, 0x6b, 0x2a, 0x84, 0x15, 0xc7,
      0xda, 0x31, 0x29, 0x1a, 0x5e, 0x96, 0xbb, 0x7a, 0x56, 0x63, 0x9e, 0x17, 0x7d, 0x30, 0x1b, 0xeb,
    ]));
    const pubKey = await schnorr.computePublicKey(privateKey);
    const msg = Fr.random();
    const signature = await schnorr.constructSignature(msg, privateKey);
    const verified = await schnorr.verifySignature(msg, pubKey, signature);

    expect(verified).toBe(true);
  });

  it('should fail invalid signature', async () => {
    // prettier-ignore
    const privateKey = GrumpkinScalar.fromBuffer(Buffer.from([
      0x0b, 0x9b, 0x3a, 0xde, 0xe6, 0xb3, 0xd8, 0x1b, 0x28, 0xa0, 0x88, 0x6b, 0x2a, 0x84, 0x15, 0xc7,
      0xda, 0x31, 0x29, 0x1a, 0x5e, 0x96, 0xbb, 0x7a, 0x56, 0x63, 0x9e, 0x17, 0x7d, 0x30, 0x1b, 0xeb,
    ]));
    const pubKey = await schnorr.computePublicKey(privateKey);
    const msg = Fr.random();
    const signature = await schnorr.constructSignature(msg, GrumpkinScalar.random());
    const verified = await schnorr.verifySignature(msg, pubKey, signature);

    expect(verified).toBe(false);
  });
});
