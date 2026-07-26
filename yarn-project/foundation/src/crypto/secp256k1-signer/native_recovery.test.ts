import { Buffer32 } from '@aztec/foundation/buffer';

import { secp256k1 } from '@noble/curves/secp256k1';

import { EthAddress } from '../../eth-address/index.js';
import { Signature } from '../../eth-signature/eth_signature.js';
import { keccak256 } from '../keccak/index.js';
import { Secp256k1Signer } from './secp256k1_signer.js';
import {
  type RecoveryOpts,
  Secp256k1Error,
  flipSignature,
  generateUnrecoverableSignature,
  makeEthSignDigest,
  recoverAddress,
  recoverPublicKey,
  toRecoveryBit,
  tryRecoverAddress,
} from './utils.js';

// `recoverPublicKey` routes elliptic-curve recovery through native libsecp256k1 when available
// (Node) and falls back to `@noble/curves` otherwise. These tests assert the native path is
// behaviourally identical to the pure-JS path across every signature variety: recovered keys and
// addresses must be byte-for-byte equal, and success/failure must agree. The reference below is a
// faithful re-implementation of the `@noble/curves` path (the pre-change implementation).

/** Reference `@noble/curves` recovery, independent of the native binding. */
function nobleRecoverPublicKey(hash: Buffer32, signature: Signature, opts: RecoveryOpts = {}): Buffer {
  const { r, s, v } = signature;
  if (!opts.allowYParityAsV && v !== 27 && v !== 28) {
    throw new Secp256k1Error(`Invalid v value ${v} (expected 27 or 28)`);
  }
  const sig = new secp256k1.Signature(r.toBigInt(), s.toBigInt()).addRecoveryBit(toRecoveryBit(v));
  if (!opts.allowMalleable && sig.hasHighS()) {
    throw new Secp256k1Error('Signature has high s-value (malleable signature)');
  }
  return Buffer.from(sig.recoverPublicKey(hash.buffer).toHex(false), 'hex');
}

function nobleRecoverAddress(hash: Buffer32, signature: Signature, opts?: RecoveryOpts): EthAddress {
  return new EthAddress(keccak256(nobleRecoverPublicKey(hash, signature, opts).subarray(1)).subarray(12));
}

/** Asserts the native and `@noble/curves` paths agree — same value on success, same failure otherwise. */
function expectEquivalent(hash: Buffer32, signature: Signature, opts?: RecoveryOpts) {
  const capture = <T>(fn: () => T): { value?: T; threw: boolean } => {
    try {
      return { value: fn(), threw: false };
    } catch {
      return { threw: true };
    }
  };

  const native = capture(() => recoverPublicKey(hash, signature, opts));
  const noble = capture(() => nobleRecoverPublicKey(hash, signature, opts));

  expect(native.threw).toBe(noble.threw);
  if (!native.threw) {
    expect(native.value).toEqual(noble.value);
    expect(recoverAddress(hash, signature, opts).toString()).toEqual(
      nobleRecoverAddress(hash, signature, opts).toString(),
    );
  }
  // tryRecoverAddress must agree on both value and definedness.
  expect(tryRecoverAddress(hash, signature, opts)?.toString()).toEqual(
    noble.threw ? undefined : nobleRecoverAddress(hash, signature, opts).toString(),
  );
}

describe('secp256k1 native/noble recovery equivalence', () => {
  it('agrees on standard signatures across both recovery bits (v=27 and v=28)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const signer = Secp256k1Signer.random();
      const digest = Buffer32.random();
      const signature = signer.sign(digest);
      seen.add(signature.v);
      expectEquivalent(digest, signature);
      // Recovered address must also match the actual signer.
      expect(recoverAddress(digest, signature).toString()).toEqual(signer.address.toString());
    }
    // Both parities should occur over 100 random signatures.
    expect([...seen].sort()).toEqual([27, 28]);
  });

  it('agrees on eth-signed-message digests', () => {
    for (let i = 0; i < 20; i++) {
      const signer = Secp256k1Signer.random();
      const message = Buffer32.random();
      const digest = makeEthSignDigest(message);
      expectEquivalent(digest, signer.sign(digest));
    }
  });

  it('agrees on high-s (malleable) signatures', () => {
    for (let i = 0; i < 20; i++) {
      const signer = Secp256k1Signer.random();
      const digest = Buffer32.random();
      const flipped = flipSignature(signer.sign(digest));
      // Both reject by default and both accept (identically) with allowMalleable.
      expectEquivalent(digest, flipped);
      expectEquivalent(digest, flipped, { allowMalleable: true });
      expect(recoverAddress(digest, flipped, { allowMalleable: true }).toString()).toEqual(signer.address.toString());
    }
  });

  it('agrees on y-parity encoded v values (0/1) with allowYParityAsV', () => {
    for (let i = 0; i < 20; i++) {
      const signer = Secp256k1Signer.random();
      const digest = Buffer32.random();
      const signature = signer.sign(digest);
      const yParity = new Signature(signature.r, signature.s, signature.v - 27);
      // Rejected by default, accepted (identically) with allowYParityAsV.
      expectEquivalent(digest, yParity);
      expectEquivalent(digest, yParity, { allowYParityAsV: true });
    }
  });

  it('agrees on invalid v values', () => {
    const signer = Secp256k1Signer.random();
    const digest = Buffer32.random();
    const signature = signer.sign(digest);
    for (const v of [2, 5, 26, 29, 255]) {
      expectEquivalent(digest, new Signature(signature.r, signature.s, v));
    }
  });

  it('agrees on unrecoverable signatures', () => {
    for (let i = 0; i < 20; i++) {
      expectEquivalent(Buffer32.random(), generateUnrecoverableSignature());
    }
  });
});
