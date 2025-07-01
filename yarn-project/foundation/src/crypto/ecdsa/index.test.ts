import { TextEncoder } from 'util';

import { Ecdsa } from './index.js';

describe('ECDSA over the secp256k1 curve', () => {
  ECDSATestSuite(new Ecdsa('secp256k1'));
});

describe('ECDSA over the secp256r1 curve', () => {
  ECDSATestSuite(new Ecdsa('secp256r1'));
});

function ECDSATestSuite(ecdsa: Ecdsa) {
  it('should verify signature', async () => {
    // prettier-ignore
    const privateKey = Buffer.from([
      0x0b, 0x9b, 0x3a, 0xde, 0xe6, 0xb3, 0xd8, 0x1b, 0x28, 0xa0, 0x88, 0x6b, 0x2a, 0x84, 0x15, 0xc7,
      0xda, 0x31, 0x29, 0x1a, 0x5e, 0x96, 0xbb, 0x7a, 0x56, 0x63, 0x9e, 0x17, 0x7d, 0x30, 0x1b, 0xeb,
    ]);
    const pubKey = await ecdsa.computePublicKey(privateKey);
    const msg = new TextEncoder().encode('The quick brown dog jumped over the lazy fox.');
    const signature = await ecdsa.constructSignature(msg, privateKey);
    const verified = await ecdsa.verifySignature(msg, pubKey, signature);

    expect(verified).toBe(true);
  });

  it('should not verify invalid signature', async () => {
    // prettier-ignore
    const privateKey = Buffer.from([
      0x0b, 0x9b, 0x3a, 0xde, 0xe6, 0xb3, 0xd8, 0x1b, 0x28, 0xa0, 0x88, 0x6b, 0x2a, 0x84, 0x15, 0xc7,
      0xda, 0x31, 0x29, 0x1a, 0x5e, 0x96, 0xbb, 0x7a, 0x56, 0x63, 0x9e, 0x17, 0x7d, 0x30, 0x1b, 0xeb,
    ]);
    const pubKey = await ecdsa.computePublicKey(privateKey);
    const msg = new TextEncoder().encode('The quick brown dog jumped over the lazy fox.');
    const signature = await ecdsa.constructSignature(msg, privateKey);
    signature.r[0] = 0x00;
    const verified = await ecdsa.verifySignature(msg, pubKey, signature);

    expect(verified).toBe(false);
  });

  it('should recover public key from signature', async () => {
    // prettier-ignore
    const privateKey = Buffer.from([
      0x0b, 0x9b, 0x3a, 0xde, 0xe6, 0xb3, 0xd8, 0x1b, 0x28, 0xa0, 0x88, 0x6b, 0x2a, 0x84, 0x15, 0xc7,
      0xda, 0x31, 0x29, 0x1a, 0x5e, 0x96, 0xbb, 0x7a, 0x56, 0x63, 0x9e, 0x17, 0x7d, 0x30, 0x1b, 0xeb,
    ]);
    const pubKey = await ecdsa.computePublicKey(privateKey);
    const msg = new TextEncoder().encode('The quick brown dog jumped over the lazy fox...');
    const signature = await ecdsa.constructSignature(msg, privateKey);

    // First, recover the public key
    const recoveredPubKey = await ecdsa.recoverPublicKey(msg, signature);

    // Then, verify the signature using the recovered public key
    const verified = await ecdsa.verifySignature(msg, recoveredPubKey, signature);

    expect(recoveredPubKey).toEqual(pubKey);
    expect(verified).toBe(true);
  });
}
