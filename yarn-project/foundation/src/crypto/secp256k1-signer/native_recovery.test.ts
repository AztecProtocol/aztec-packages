import { Buffer32 } from '@aztec/foundation/buffer';

import { secp256k1 } from '@noble/curves/secp256k1';

import { Signature } from '../../eth-signature/eth_signature.js';
import { Secp256k1Signer } from './secp256k1_signer.js';
import { recoverPublicKey } from './utils.js';

/**
 * `recoverPublicKey` routes elliptic-curve recovery through native libsecp256k1 when available
 * (Node) and falls back to `@noble/curves` otherwise. Recovered keys must be byte-for-byte
 * identical across both backends. In Node the public function exercises the native path; we
 * compute the `@noble/curves` result directly here and assert parity.
 */
describe('secp256k1 recovery backend parity', () => {
  const nobleRecover = (hash: Buffer32, signature: Signature): Buffer => {
    const { r, s, v } = signature;
    const recoveryBit = v === 27 || v === 0 ? 0 : 1;
    const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt()).addRecoveryBit(recoveryBit);
    return Buffer.from(sig.recoverPublicKey(hash.buffer).toHex(false), 'hex');
  };

  it('native and @noble/curves recover identical public keys', () => {
    for (let i = 0; i < 50; i++) {
      const signer = new Secp256k1Signer(Buffer32.random());
      const hash = Buffer32.random();
      const signature = signer.sign(hash);

      expect(recoverPublicKey(hash, signature)).toEqual(nobleRecover(hash, signature));
    }
  });
});
