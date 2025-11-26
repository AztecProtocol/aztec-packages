import { Buffer32 } from '@aztec/foundation/buffer';

import { generatePrivateKey } from 'viem/accounts';

import type { EthAddress } from '../../eth-address/index.js';
import { Signature } from '../../eth-signature/eth_signature.js';
import { Secp256k1Signer } from './secp256k1_signer.js';
import {
  Secp256k1Error,
  flipSignature,
  makeEthSignDigest,
  normalizeSignature,
  recoverAddress,
  tryRecoverAddress,
} from './utils.js';

describe('ecdsa malleability', () => {
  let privateKey: `0x${string}`;
  let signer: Secp256k1Signer;
  let expectedAddress: EthAddress;
  let message: Buffer32;
  let digest: Buffer32;
  let originalSignature: Signature;

  beforeEach(() => {
    // Generate a random private key and signer
    privateKey = generatePrivateKey();
    signer = new Secp256k1Signer(Buffer32.fromBuffer(Buffer.from(privateKey.slice(2), 'hex')));
    expectedAddress = signer.address;

    // Create a random message and sign it
    message = Buffer32.random();
    digest = makeEthSignDigest(message);
    originalSignature = signer.sign(digest);
  });

  it('recovers the same address from both original and flipped signatures', () => {
    // Recover address from original signature
    const recoveredFromOriginal = recoverAddress(digest, originalSignature);
    expect(recoveredFromOriginal.toString()).toEqual(expectedAddress.toString());

    // Flip the signature
    const flippedSignature = flipSignature(originalSignature);

    // Ensure the flipped signature is different
    expect(flippedSignature.equals(originalSignature)).toBe(false);
    expect(flippedSignature.r.equals(originalSignature.r)).toBe(true); // r should be the same
    expect(flippedSignature.s.equals(originalSignature.s)).toBe(false); // s should be different
    expect(flippedSignature.v).not.toEqual(originalSignature.v); // v should be different

    // Recover address from flipped signature (must use allowMalleable: true)
    const recoveredFromFlipped = recoverAddress(digest, flippedSignature, { allowMalleable: true });
    expect(recoveredFromFlipped.toString()).toEqual(expectedAddress.toString());
    expect(() => recoverAddress(digest, flippedSignature)).toThrow(Secp256k1Error);

    // Both recovered addresses should match
    expect(recoveredFromOriginal.equals(recoveredFromFlipped)).toBe(true);
  });

  it('flips signature back and forth correctly', () => {
    // Flip once
    const flipped = flipSignature(originalSignature);

    // Flip back
    const flippedBack = flipSignature(flipped);

    // Should match the original
    expect(flippedBack.equals(originalSignature)).toBe(true);
  });

  it('rejects malleable signatures by default in recoverAddress', () => {
    // Original signature should work
    expect(() => recoverAddress(digest, originalSignature)).not.toThrow();

    // Flip the signature to make it malleable
    const flippedSignature = flipSignature(originalSignature);

    // Flipped signature should be rejected by default
    expect(() => recoverAddress(digest, flippedSignature)).toThrow(Secp256k1Error);
  });

  it('accepts malleable signatures when allowMalleable is true', () => {
    // Flip the signature to make it malleable
    const flippedSignature = flipSignature(originalSignature);

    // Should work with allowMalleable: true
    const recoveredAddress = recoverAddress(digest, flippedSignature, { allowMalleable: true });
    expect(recoveredAddress.toString()).toEqual(expectedAddress.toString());
  });

  it('rejects malleable signatures by default in tryRecoverAddress', () => {
    // Original signature should work
    expect(tryRecoverAddress(digest, originalSignature)).toBeDefined();

    // Flip the signature to make it malleable
    const flippedSignature = flipSignature(originalSignature);

    // Flipped signature should return undefined by default
    expect(tryRecoverAddress(digest, flippedSignature)).toBeUndefined();
  });

  it('accepts malleable signatures in tryRecoverAddress when allowMalleable is true', () => {
    // Flip the signature to make it malleable
    const flippedSignature = flipSignature(originalSignature);

    // Should work with allowMalleable: true
    const recoveredAddress = tryRecoverAddress(digest, flippedSignature, { allowMalleable: true });
    expect(recoveredAddress).toBeDefined();
    expect(recoveredAddress!.toString()).toEqual(expectedAddress.toString());
  });

  it('normalizes signature with high s-value correctly', () => {
    // Flip the signature to create a high s-value signature
    const highSSignature = flipSignature(originalSignature);

    // Recover address using the high s-value signature with allowMalleable: true
    const recoveredAddress = recoverAddress(digest, highSSignature, { allowMalleable: true });
    expect(recoveredAddress.toString()).toEqual(expectedAddress.toString());

    // Check that the signature is flipped back to low s-value when normalized
    const normalizedSignature = flipSignature(highSSignature);
    expect(normalizedSignature.equals(originalSignature)).toBe(true);
  });

  it('does not alter low s-value signatures when normalizing', () => {
    // Recover address using the original low s-value signature
    const recoveredAddress = recoverAddress(digest, originalSignature);
    expect(recoveredAddress.toString()).toEqual(expectedAddress.toString());

    // Normalize the signature (should remain unchanged)
    const normalizedSignature = normalizeSignature(originalSignature);
    expect(normalizedSignature.equals(originalSignature)).toBe(true);
  });

  it('rejects signatures with invalid v-value', () => {
    const signature = new Signature(originalSignature.r, originalSignature.s, originalSignature.v - 27);
    expect(() => recoverAddress(digest, signature)).toThrow(Secp256k1Error);
    const recoveredAddress = recoverAddress(digest, signature, { allowYParityAsV: true });
    expect(recoveredAddress.toString()).toEqual(expectedAddress.toString());
  });
});
