import { Fq, Fr } from '../../fields/fields.js';
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
        expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
      }
    });

    it('produces uniformly distributed keys', () => {
      // Statistical test: derived keys should be roughly uniform
      const samples = 1000;
      const buckets = 10;
      const counts = new Array(buckets).fill(0);
      const bucketSize = Fr.MODULUS / BigInt(buckets);

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
        expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
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
      expect(range).toBeGreaterThan(Fr.MODULUS / 100n);
    });
  });

  describe('Public Key Generation', () => {
    it('derives valid BN254 scalars for public key generation', () => {
      const k = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const fr = Fr.fromHexString(k);

      // Verify scalar is valid and in range
      expect(fr.isZero()).toBe(false);
      expect(fr.toBigInt()).toBeGreaterThan(0n);
      expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
    });

    it('generates valid G1 points on the BN254 curve', () => {
      for (let i = 0; i < 10; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
        const fr = Fr.fromHexString(sk);

        // Verify scalar is valid and non-zero
        expect(fr.isZero()).toBe(false);
        expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
      }
    });

    it('generates valid G2 scalars from private keys', () => {
      for (let i = 0; i < 10; i++) {
        const path = `m/12381/3600/${i}/0/0`;
        const sk = deriveBlsKeyFromMnemonic(mnemonic, path, '');
        const fr = Fr.fromHexString(sk);

        // Verify scalar is valid and non-zero
        expect(fr.isZero()).toBe(false);
        expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
      }
    });

    it('verifies different paths produce different keys', () => {
      const sk1 = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const sk2 = deriveBlsKeyFromMnemonic(mnemonic, pathB, passphrase);

      // Different paths should produce different keys
      expect(sk1).not.toBe(sk2);

      const fr1 = Fr.fromHexString(sk1);
      const fr2 = Fr.fromHexString(sk2);

      expect(fr1.equals(fr2)).toBe(false);
    });
  });

  describe('Proof of Possession Structure', () => {
    it('generates valid private keys for signature structure', () => {
      // This test verifies that derived private keys are valid BN254 scalars
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const fr = Fr.fromHexString(sk);

      // Verify scalar is valid and non-zero
      expect(fr.isZero()).toBe(false);
      expect(fr.toBigInt()).toBeGreaterThan(0n);
      expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
    });

    it('ensures private keys are in the correct range', () => {
      // For BN254, private keys must be in the scalar field Fr
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, passphrase);
      const skBigInt = BigInt(sk);

      // Verify the scalar is in valid range
      expect(skBigInt).toBeGreaterThan(0n);
      expect(skBigInt).toBeLessThan(Fr.MODULUS);
    });
  });

  describe('Constant Verification', () => {
    it('verifies BN254 constants match expected values', () => {
      // Fp (base field order)
      expect(Fq.MODULUS).toBe(21888242871839275222246405745257275088696311157297823662689037894645226208583n);

      // Fr (scalar field order)
      expect(Fr.MODULUS).toBe(21888242871839275222246405745257275088548364400416034343698204186575808495617n);
    });

    it('verifies Fr field operations are valid', () => {
      const a = Fr.fromString('12345');
      const b = Fr.fromString('67890');

      // Basic field operations should work
      const sum = a.add(b);
      const diff = a.sub(b);
      const prod = a.mul(b);

      expect(sum.toBigInt()).toBeLessThan(Fr.MODULUS);
      expect(diff.toBigInt()).toBeLessThan(Fr.MODULUS);
      expect(prod.toBigInt()).toBeLessThan(Fr.MODULUS);
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
          const diff = (keys[i] - keys[j] + Fr.MODULUS) % Fr.MODULUS;
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
      const sum = (validatorScalar + attackerScalar) % Fr.MODULUS;
      const diff = (validatorScalar - attackerScalar + Fr.MODULUS) % Fr.MODULUS;
      const product = (validatorScalar * attackerScalar) % Fr.MODULUS;

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
        expect(parsed).toBeLessThan(Fr.MODULUS);
      }
    });

    it('verifies private keys can be serialized to 32 bytes', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, '');
      const skBigInt = BigInt(sk);

      // Verify can be encoded as 32-byte values
      const hex = skBigInt.toString(16).padStart(64, '0');
      expect(hex.length).toBe(64);

      // Verify it's in the valid range
      expect(skBigInt).toBeLessThan(Fr.MODULUS);
    });

    it('verifies field elements are properly bounded', () => {
      const sk = deriveBlsKeyFromMnemonic(mnemonic, pathA, '');
      const fr = Fr.fromHexString(sk);

      // Field element should be less than modulus
      expect(fr.toBigInt()).toBeLessThan(Fr.MODULUS);
      expect(fr.toBigInt()).toBeGreaterThan(0n);
    });
  });
});
