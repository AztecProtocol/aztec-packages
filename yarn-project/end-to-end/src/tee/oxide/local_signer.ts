import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, tryRecoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

const DIGEST_BYTES = 32;
export const SIGNATURE_BYTES = 65;

// 65-byte (r || s || v) layout so the L1 `TeeRegistry` can `ECDSA.recover`
// directly without re-packing. Noir will not verify the signature, so there is no
// need to also expose the raw (pub_x, pub_y) coordinates the on-chain Aztec verifier
// would otherwise consume.
//
// Named `LocalSigner` rather than `TeeSigner` to avoid colliding with Alvaro's
// Grumpkin Schnorr `TeeSigner` in `../signer.ts` - task #11 will merge these.
export class LocalSigner {
  readonly ethAddress: EthAddress;
  private readonly inner: Secp256k1Signer;

  constructor(privateKey: Buffer32) {
    this.inner = new Secp256k1Signer(privateKey);
    this.ethAddress = this.inner.address;
  }

  sign(digest: Buffer): Buffer {
    if (digest.length !== DIGEST_BYTES) {
      throw new Error(`digest must be ${DIGEST_BYTES} bytes, got ${digest.length}`);
    }
    const sig = this.inner.sign(Buffer32.fromBuffer(digest));
    return Buffer.concat([sig.r.toBuffer(), sig.s.toBuffer(), Buffer.from([sig.v])]);
  }

  static random(): LocalSigner {
    return new LocalSigner(Buffer32.random());
  }

  // Mirrors Solidity `ECDSA.recover` - returns the 20-byte signer address or
  // `undefined` if the signature cannot be validly interpreted over `digest`.
  static recover(digest: Buffer, signature: Buffer): Buffer | undefined {
    if (digest.length !== DIGEST_BYTES) {
      throw new Error(`digest must be ${DIGEST_BYTES} bytes, got ${digest.length}`);
    }
    if (signature.length !== SIGNATURE_BYTES) {
      throw new Error(`signature must be ${SIGNATURE_BYTES} bytes, got ${signature.length}`);
    }
    const sig = new Signature(
      Buffer32.fromBuffer(signature.subarray(0, 32)),
      Buffer32.fromBuffer(signature.subarray(32, 64)),
      signature[64],
    );
    const recovered = tryRecoverAddress(Buffer32.fromBuffer(digest), sig);
    return recovered?.toBuffer();
  }
}
