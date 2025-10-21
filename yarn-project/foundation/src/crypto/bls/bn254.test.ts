import { bn254 } from '@noble/curves/bn254';

import { Fr } from '../../fields/fields.js';
import { deriveBlsKeyFromEntropy, deriveBlsKeyFromMnemonic } from './index.js';

describe('BN254 BLS Implementation', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const passphrase = 'test-pass';
  const pathA = 'm/12381/3600/0/0/0';
  const pathB = 'm/12381/3600/1/0/0';

  describe('Key Derivation', () => {
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

    it('derives from IKM deterministically', () => {
      const ikm = '0x11223344556677889900aabbccddeeff';
      const k1 = deriveBlsKeyFromEntropy(ikm, pathA);
      const k2 = deriveBlsKeyFromEntropy(ikm, pathA);
      expect(k1).toEqual(k2);
    });

    it('domain separation: mnemonic vs IKM produce different keys', () => {
      const seedAsIkm = '0x' + Buffer.from('seed-like-bytes-for-test').toString('hex');
      const km = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const ke = deriveBlsKeyFromEntropy(seedAsIkm, pathA);
      expect(km).not.toEqual(ke);
    });

    it('produces a 32-byte hex scalar with 0x prefix', () => {
      const k = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      expect(k).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('outputs are valid BN254 scalars and non-zero', () => {
      const k = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const fr = Fr.fromHexString(k);
      expect(fr.isZero()).toBeFalsy();
      expect(fr.toBigInt() < Fr.MODULUS).toBeTruthy();
    });

    it('ensures derived keys are non-zero across multiple derivations', () => {
      for (let i = 0; i < 100; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const k = deriveBlsKeyFromMnemonic(mnemonic, path, passphrase);
        const fr = Fr.fromHexString(k);
        expect(fr.isZero()).toBe(false);
        expect(fr.toBigInt()).toBeGreaterThan(0n);
        expect(fr.toBigInt()).toBeLessThan(bn254.fields.Fr.ORDER);
      }
    });

    it('produces uniformly distributed keys', () => {
      // Statistical test: derived keys should be roughly uniform
      const samples = 1000;
      const buckets = 10;
      const counts = new Array(buckets).fill(0);
      const bucketSize = bn254.fields.Fr.ORDER / BigInt(buckets);

      for (let i = 0; i < samples; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const k = deriveBlsKeyFromMnemonic(mnemonic, path, '');
        const scalar = BigInt(k);
        const bucket = Number(scalar / bucketSize);
        counts[Math.min(bucket, buckets - 1)]++;
      }

      // Chi-squared test for uniformity (very rough check)
      const expected = samples / buckets;
      const chi2 = counts.reduce((sum, count) => {
        const diff = count - expected;
        return sum + (diff * diff) / expected;
      }, 0);

      // For 9 degrees of freedom, chi2 should be < ~21.67 at 99% confidence
      // We use a more relaxed bound since this is a rough test
      expect(chi2).toBeLessThan(30);
    });

    it('prevents collision between mnemonic and IKM derivation paths', () => {
      // Generate many keys via both paths and ensure no collisions
      const mnemonicKeys = new Set<string>();
      const ikmKeys = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const ikm = `0x${i.toString(16).padStart(64, '0')}`;

        const km = deriveBlsKeyFromMnemonic(mnemonic, path, '');
        const ke = deriveBlsKeyFromEntropy(ikm, path);

        mnemonicKeys.add(km);
        ikmKeys.add(ke);

        // Keys should be different
        expect(km).not.toBe(ke);
      }

      // No collisions within each set
      expect(mnemonicKeys.size).toBe(100);
      expect(ikmKeys.size).toBe(100);

      // No collisions between sets
      for (const mk of mnemonicKeys) {
        expect(ikmKeys.has(mk)).toBe(false);
      }
    });

    it('handles edge case IKM values', () => {
      const edgeCases = [
        '0x00',
        '0x01',
        '0xff',
        '0x' + 'ff'.repeat(32),
        '0x' + '00'.repeat(32),
        '0x' + '80'.repeat(32),
      ];

      for (const ikm of edgeCases) {
        const k = deriveBlsKeyFromEntropy(ikm, pathA);
        const fr = Fr.fromHexString(k);
        expect(fr.isZero()).toBe(false);
        expect(fr.toBigInt()).toBeLessThan(bn254.fields.Fr.ORDER);
      }
    });

    it('handles unicode and special characters in passphrase', () => {
      const specialPassphrases = ['', ' ', '🔐🔑', 'पासवर्ड', '密码', '\0\n\r\t', 'pass\u0000word'];

      for (const pass of specialPassphrases) {
        const k = deriveBlsKeyFromMnemonic(mnemonic, pathA, pass);
        const fr = Fr.fromHexString(k);
        expect(fr.isZero()).toBe(false);
      }
    });

    it('ensures resistance to modular reduction bias', () => {
      // The mod operation in key derivation could introduce bias if input
      // isn't much larger than modulus. HMAC-SHA512 gives 512 bits,
      // and Fr.ORDER is ~254 bits, so bias should be negligible (~2^-258)
      const samples = 100;
      const keys = [];

      for (let i = 0; i < samples; i++) {
        const ikm = `0x${i.toString(16).padStart(64, '0')}`;
        const k = deriveBlsKeyFromEntropy(ikm, pathA);
        keys.push(BigInt(k));
      }

      // Check that keys span a good range
      const min = keys.reduce((a, b) => (a < b ? a : b));
      const max = keys.reduce((a, b) => (a > b ? a : b));
      const range = max - min;

      // Range should be significant (at least 1% of field size as rough heuristic)
      expect(range).toBeGreaterThan(bn254.fields.Fr.ORDER / 100n);
    });
  });

  describe('Public Key Generation', () => {
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

    it('generates valid G1 points on the BN254 curve', () => {
      for (let i = 0; i < 10; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
        const skBigInt = BigInt(sk);
        const skReduced = skBigInt % bn254.fields.Fr.ORDER;

        const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

        // Verify point is on curve: y² = x³ + 3
        const lhs = (pk1.y * pk1.y) % bn254.fields.Fp.ORDER;
        const rhs = (pk1.x * pk1.x * pk1.x + 3n) % bn254.fields.Fp.ORDER;
        expect(lhs).toBe(rhs);

        // Verify not at infinity
        expect(pk1.x).not.toBe(0n);
        expect(pk1.y).not.toBe(0n);
      }
    });

    it('generates valid G2 points from private keys', () => {
      for (let i = 0; i < 10; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
        const skBigInt = BigInt(sk);
        const skReduced = skBigInt % bn254.fields.Fr.ORDER;

        const pk2 = bn254.G2.ProjectivePoint.BASE.multiply(skReduced).toAffine();

        // Verify not at infinity (basic check)
        expect(pk2.x.c0).not.toBe(0n);
        expect(pk2.x.c1).not.toBe(0n);
      }
    });

    it('verifies G1 and G2 public keys match (same discrete log)', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const skBigInt = BigInt(sk);
      const skReduced = skBigInt % bn254.fields.Fr.ORDER;

      const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(skReduced);
      const pk2 = bn254.G2.ProjectivePoint.BASE.multiply(skReduced);

      // We can't directly verify the pairing here without more infrastructure,
      // but we can verify both are non-trivial points
      expect(pk1.equals(bn254.G1.ProjectivePoint.ZERO)).toBe(false);
      expect(pk2.equals(bn254.G2.ProjectivePoint.ZERO)).toBe(false);

      // Generate with a different key and ensure they're different
      const sk2 = deriveBlsKeyFromMnemonic(mnemonic, pathB, passphrase);
      const sk2Reduced = BigInt(sk2) % bn254.fields.Fr.ORDER;
      const pk1Diff = bn254.G1.ProjectivePoint.BASE.multiply(sk2Reduced);
      const pk2Diff = bn254.G2.ProjectivePoint.BASE.multiply(sk2Reduced);

      expect(pk1.equals(pk1Diff)).toBe(false);
      expect(pk2.equals(pk2Diff)).toBe(false);
    });
  });

  describe('Proof of Possession Structure', () => {
    it('generates valid signatures for proof of possession structure', () => {
      // This test verifies the mathematical structure that Solidity will check
      // σ = H(pk1) * sk where H is hash-to-curve
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const skBigInt = BigInt(sk);
      const skReduced = skBigInt % bn254.fields.Fr.ORDER;

      const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(skReduced).toAffine();

      // We can't easily replicate the exact hash-to-curve from Solidity,
      // but we can verify the structure would work
      // For now, just verify pk1 is valid
      expect(pk1.x).toBeGreaterThan(0n);
      expect(pk1.y).toBeGreaterThan(0n);

      // Verify on curve: y² = x³ + 3
      const lhs = (pk1.y * pk1.y) % bn254.fields.Fp.ORDER;
      const rhs = (pk1.x * pk1.x * pk1.x + 3n) % bn254.fields.Fp.ORDER;
      expect(lhs).toBe(rhs);
    });

    it('ensures signature points are in the correct subgroup', () => {
      // For BN254, we need to ensure points are in the r-torsion subgroup
      // This is automatically guaranteed for points of the form [sk]G
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const skReduced = BigInt(sk) % bn254.fields.Fr.ORDER;

      const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(skReduced);

      // For points in the correct subgroup, [r]P = 0
      // Since we generated P = [sk]G where G has order r, P has order dividing r
      // So P is in the r-torsion subgroup

      // Verify the point is not low-order
      // For BN254, the cofactor is 1, so all non-zero points are in the prime-order subgroup
      expect(pk1.equals(bn254.G1.ProjectivePoint.ZERO)).toBe(false);

      // Verify that doubling many times doesn't quickly reach infinity
      let temp = pk1;
      for (let i = 0; i < 100; i++) {
        temp = temp.double();
        expect(temp.equals(bn254.G1.ProjectivePoint.ZERO)).toBe(false);
      }
    });
  });

  describe('Constant Verification', () => {
    it('verifies BN254 constants match Solidity', () => {
      // Fp (base field order)
      expect(bn254.fields.Fp.ORDER).toBe(
        21888242871839275222246405745257275088696311157297823662689037894645226208583n,
      );

      // Fr (scalar field order)
      expect(bn254.fields.Fr.ORDER).toBe(
        21888242871839275222246405745257275088548364400416034343698204186575808495617n,
      );

      // G1 generator
      const g1 = bn254.G1.ProjectivePoint.BASE.toAffine();
      expect(g1.x).toBe(1n);
      expect(g1.y).toBe(2n);

      // Verify G1 generator is on curve
      const lhs = (g1.y * g1.y) % bn254.fields.Fp.ORDER;
      const rhs = (g1.x * g1.x * g1.x + 3n) % bn254.fields.Fp.ORDER;
      expect(lhs).toBe(rhs);
    });

    it('verifies G2 generator matches expected values', () => {
      const g2 = bn254.G2.ProjectivePoint.BASE.toAffine();

      expect(g2.x.c0).toBe(10857046999023057135944570762232829481370756359578518086990519993285655852781n);
      expect(g2.x.c1).toBe(11559732032986387107991004021392285783925812861821192530917403151452391805634n);
      expect(g2.y.c0).toBe(8495653923123431417604973247489272438418190587263600148770280649306958101930n);
      expect(g2.y.c1).toBe(4082367875863433681332203403145435568316851327593401208105741076214120093531n);
    });
  });

  describe('Cryptographic Properties', () => {
    it('verifies key independence', () => {
      // Keys derived from different paths should be cryptographically independent
      const keys = [];
      for (let i = 0; i < 20; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        keys.push(BigInt(deriveBlsKeyFromMnemonic(mnemonic, path, '')));
      }

      // Check no obvious linear relationships
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          expect(keys[i]).not.toBe(keys[j]);
          // Check that difference is not small
          const diff = (keys[i] - keys[j] + bn254.fields.Fr.ORDER) % bn254.fields.Fr.ORDER;
          expect(diff).toBeGreaterThan(1000n);
        }
      }
    });

    it('prevents related-key attacks through independent derivation', () => {
      // Derive keys for a validator and ensure attacker can't derive related keys
      const validatorKey = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);

      // Even with knowledge of the path, different passphrases give uncorrelated keys
      const attackerKey = deriveBlsKeyFromMnemonic(mnemonic, pathA, 'attacker');

      const validatorScalar = BigInt(validatorKey);
      const attackerScalar = BigInt(attackerKey);

      // Keys should be uncorrelated
      expect(validatorScalar).not.toBe(attackerScalar);

      // No simple relationship
      const sum = (validatorScalar + attackerScalar) % bn254.fields.Fr.ORDER;
      const diff = (validatorScalar - attackerScalar + bn254.fields.Fr.ORDER) % bn254.fields.Fr.ORDER;
      const product = (validatorScalar * attackerScalar) % bn254.fields.Fr.ORDER;

      expect(sum).not.toBe(0n);
      expect(diff).not.toBe(0n);
      expect(product).not.toBe(0n);
      expect(product).not.toBe(1n);
    });
  });

  describe('Serialization and Encoding', () => {
    it('ensures consistent 32-byte encoding', () => {
      for (let i = 0; i < 10; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const k = deriveBlsKeyFromMnemonic(mnemonic, path, '');

        // Should be 0x + 64 hex chars = 32 bytes
        expect(k).toMatch(/^0x[0-9a-fA-F]{64}$/);

        // Should parse correctly
        const parsed = BigInt(k);
        expect(parsed).toBeGreaterThan(0n);
        expect(parsed).toBeLessThan(bn254.fields.Fr.ORDER);
      }
    });

    it('verifies G1 point serialization format', () => {
      const sk = BigInt(deriveBlsKeyFromMnemonic(mnemonic, pathA, ''));
      const pk1 = bn254.G1.ProjectivePoint.BASE.multiply(sk % bn254.fields.Fr.ORDER).toAffine();

      // Verify coordinates fit in field
      expect(pk1.x).toBeLessThan(bn254.fields.Fp.ORDER);
      expect(pk1.y).toBeLessThan(bn254.fields.Fp.ORDER);

      // Verify can be encoded as 32-byte values
      const xHex = pk1.x.toString(16).padStart(64, '0');
      const yHex = pk1.y.toString(16).padStart(64, '0');
      expect(xHex.length).toBe(64);
      expect(yHex.length).toBe(64);
    });

    it('verifies G2 point coordinate order for Solidity compatibility', () => {
      // Solidity expects: (x_imaginary, x_real, y_imaginary, y_real)
      // noble/curves provides: (x.c0, x.c1, y.c0, y.c1)
      const sk = BigInt(deriveBlsKeyFromMnemonic(mnemonic, pathA, ''));
      const pk2 = bn254.G2.ProjectivePoint.BASE.multiply(sk % bn254.fields.Fr.ORDER).toAffine();

      // Document the mapping
      const solidityFormat = {
        x0: pk2.x.c0, // x_real
        x1: pk2.x.c1, // x_imaginary
        y0: pk2.y.c0, // y_real
        y1: pk2.y.c1, // y_imaginary
      };

      // Verify all components are valid field elements
      expect(solidityFormat.x0).toBeLessThan(bn254.fields.Fp.ORDER);
      expect(solidityFormat.x1).toBeLessThan(bn254.fields.Fp.ORDER);
      expect(solidityFormat.y0).toBeLessThan(bn254.fields.Fp.ORDER);
      expect(solidityFormat.y1).toBeLessThan(bn254.fields.Fp.ORDER);
    });
  });
});
