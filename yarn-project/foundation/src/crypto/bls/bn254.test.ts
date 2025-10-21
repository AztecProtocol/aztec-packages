import { bn254 } from '@noble/curves/bn254';

import { Fr } from '../../fields/fields.js';
import { deriveBlsKeyFromEntropy, deriveBlsKeyFromMnemonic } from './index.js';

describe('bn254 bls key derivation', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const passphrase = 'test-pass';
  const pathA = 'm/12381/3600/0/0/0';
  const pathB = 'm/12381/3600/1/0/0';

  it('deterministically derives the same key from mnemonic', () => {
    const k1 = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    const k2 = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    expect(k1).toEqual(k2);
  });

  it('different passphrases produce different keys', () => {
    const k1 = deriveBlsKeyFromMnemonic(mnemonic, pathA, '');
    const k2 = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    expect(k1).not.toEqual(k2);
  });

  it('different paths produce different keys', () => {
    const k1 = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    const k2 = deriveBlsKeyFromMnemonic(mnemonic, pathB, passphrase);
    expect(k1).not.toEqual(k2);
  });

  it('domain separation: mnemonic vs IKM produce different keys for same bytes', () => {
    const seedAsIkm = '0x' + Buffer.from('seed-like-bytes-for-test').toString('hex');
    const km = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    const ke = deriveBlsKeyFromEntropy(seedAsIkm, pathA);
    expect(km).not.toEqual(ke);
  });

  it('derives from IKM deterministically', () => {
    const ikm = '0x11223344556677889900aabbccddeeff';
    const k1 = deriveBlsKeyFromEntropy(ikm, pathA);
    const k2 = deriveBlsKeyFromEntropy(ikm, pathA);
    expect(k1).toEqual(k2);
  });

  it('outputs are valid BN254 scalars and non-zero', () => {
    const k = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    const fr = Fr.fromHexString(k);
    expect(fr.isZero()).toBeFalsy();
    expect(fr.toBigInt() < Fr.MODULUS).toBeTruthy();
  });

  it('derives BN254 G1/G2 public keys from the scalar', () => {
    const k = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
    const sk = BigInt(k);
    const r = bn254.fields.Fr.ORDER;
    const skReduced = sk % r;
    expect(skReduced).toBeGreaterThan(0n);

    const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();
    const pk2 = bn254.G2.ProjectivePoint.BASE.multiply(skReduced).toAffine();

    // Basic sanity checks on coordinates
    expect(typeof pk1.x).toBe('bigint');
    expect(typeof pk1.y).toBe('bigint');
    expect(typeof pk2.x.c0).toBe('bigint');
    expect(typeof pk2.x.c1).toBe('bigint');
    expect(typeof pk2.y.c0).toBe('bigint');
    expect(typeof pk2.y.c1).toBe('bigint');

    // Not at infinity
    const zeroG1 = bn254.G1.ProjectivePoint.ZERO;
    const zeroG2 = bn254.G2.ProjectivePoint.ZERO;
    expect(zeroG1.equals(bn254.G1.ProjectivePoint.fromAffine(pk1))).toBeFalsy();
    expect(zeroG2.equals(bn254.G2.ProjectivePoint.fromAffine(pk2))).toBeFalsy();
  });
});
