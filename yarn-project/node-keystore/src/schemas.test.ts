/**
 * Tests for Zod schema validation using example files
 */
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { keystoreSchema } from '../src/schemas.js';
import type { MnemonicConfig, ProverKeyStoreWithId } from './types.js';

// Helper to load example JSON files
const loadExample = (filename: string, version: 'v1' | 'v2' = 'v1') => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const examplePath = join(currentDir, '..', 'examples', version, filename);
  return JSON.parse(readFileSync(examplePath, 'utf-8'));
};

describe('Keystore Schema Validation', () => {
  it('should validate simple validator keystore example', () => {
    const keystore = loadExample('simple-validator.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.validators).toHaveLength(1);
    expect(parsed.validators![0].attester).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
    expect(
      parsed.validators![0].feeRecipient?.equals(
        AztecAddress.fromStringUnsafe('0x1234567890123456789012345678901234567890123456789012345678901234'),
      ),
    ).toBeTruthy();
  });

  it('should validate with null json keystore example', () => {
    const keystore = loadExample('simple-validator.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.validators).toHaveLength(1);
    expect(parsed.validators![0].attester).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
    expect(parsed.remoteSigner).toBeUndefined();
  });

  it('should validate simple prover keystore example', () => {
    const keystore = loadExample('simple-prover.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.prover).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
  });

  it('should validate complex multiple validators with remote signer example', () => {
    const keystore = loadExample('multiple-validators-remote.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.validators).toHaveLength(5);
    expect(parsed.remoteSigner).toBe('https://localhost:8080');
    const address = parsed.slasher as EthAddress;
    expect(address.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890'))).toBeTruthy();

    // BLS attester check
    expect(parsed.validators).toBeDefined();
    const v0: any = parsed.validators![4];
    expect(typeof v0.attester).toBe('object');
    expect(v0.attester.eth).toBe('0x0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a');
    expect(v0.attester.bls).toBe('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
  });

  it('should validate prover with publishers example', () => {
    const keystore = loadExample('prover-with-publishers-and-funding-account.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.prover).toBe('object');
    const prover = parsed.prover as ProverKeyStoreWithId;
    expect(prover.id.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890'))).toBeTruthy();
    expect(Array.isArray(prover.publisher)).toBe(true);
    expect(prover.publisher as any[]).toHaveLength(2);
    expect(parsed.fundingAccount).toBe('0x0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d');
  });

  it('should validate prover with single publisher example', () => {
    const keystore = loadExample('prover-with-single-publisher.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.prover).toBe('object');
    const prover = parsed.prover as ProverKeyStoreWithId;
    expect(prover.id.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890'))).toBeTruthy();
    if (Array.isArray(prover.publisher)) {
      expect(prover.publisher).toHaveLength(1);
      expect(prover.publisher[0]).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
    } else {
      expect(typeof prover.publisher === 'string').toBe(true);
      expect(prover.publisher).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
    }
  });

  it('should validate prover with mnemonic publisher example', () => {
    const keystore = loadExample('prover-with-mnemonic-publisher.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.prover).toBe('object');
    const prover = parsed.prover as ProverKeyStoreWithId;
    expect(prover.id.equals(EthAddress.fromString('0x1234567890123456789012345678901234567890'))).toBeTruthy();

    const mnemonic = 'test test test test test test test test test test test junk';
    const publisher: MnemonicConfig = prover.publisher as MnemonicConfig;
    expect(publisher.mnemonic).toBe(mnemonic);
    expect(publisher.addressCount).toBe(3);
  });

  it('should reject keystore with invalid schema version', () => {
    const keystore = {
      schemaVersion: 3, // Invalid
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
          feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
        },
      ],
    };

    expect(() => keystoreSchema.parse(keystore)).toThrow();
  });

  it('should accept v1 keystore with feeRecipient at validator level', () => {
    const keystore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
          feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
        },
      ],
    };

    expect(() => keystoreSchema.parse(keystore)).not.toThrow();
    const parsed = keystoreSchema.parse(keystore);
    expect([1, 2]).toContain(parsed.schemaVersion);
  });

  it('should reject v1 keystore with top-level feeRecipient', () => {
    const keystore = {
      schemaVersion: 1,
      feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
      publisher: '0x1234567890123456789012345678901234567890123456789012345678901234',
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
        },
      ],
    };

    // v1 schema doesn't allow top-level publisher/feeRecipient/coinbase
    expect(() => keystoreSchema.parse(keystore)).toThrow();
  });

  it('should reject keystore without validators or prover', () => {
    const keystore = {
      schemaVersion: 1,
    };

    expect(() => keystoreSchema.parse(keystore)).toThrow();
  });

  it('should validate validators with top-level defaults', () => {
    const keystore = loadExample('validator-with-top-level-defaults.json', 'v2');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.validators).toHaveLength(3);

    // Type guard: if schemaVersion is 2, these fields exist
    if (parsed.schemaVersion === 2) {
      expect(parsed.publisher).toBe('0x0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a');
      expect(parsed.coinbase?.equals(EthAddress.fromString('0x1111111111111111111111111111111111111111'))).toBeTruthy();
      expect(
        parsed.feeRecipient?.equals(
          AztecAddress.fromStringUnsafe('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
        ),
      ).toBeTruthy();
    }

    // First validator uses all defaults
    expect(parsed.validators![0].attester).toBe('0x2222222222222222222222222222222222222222222222222222222222222222');
    expect(parsed.validators![0].publisher).toBeUndefined();
    expect(parsed.validators![0].coinbase).toBeUndefined();
    expect(parsed.validators![0].feeRecipient).toBeUndefined();

    // Second validator overrides publisher
    expect(parsed.validators![1].publisher).toBe('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');

    // Third validator overrides coinbase and feeRecipient
    expect(
      parsed.validators![2].coinbase?.equals(EthAddress.fromString('0x2222222222222222222222222222222222222222')),
    ).toBeTruthy();
    expect(
      parsed.validators![2].feeRecipient?.equals(
        AztecAddress.fromStringUnsafe('0x0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcd'),
      ),
    ).toBeTruthy();
  });

  it('should reject v1 validators without feeRecipient', () => {
    const keystore = {
      schemaVersion: 1,
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
        },
      ],
    };

    // v1 requires feeRecipient at validator level
    expect(() => keystoreSchema.parse(keystore)).toThrow(/feeRecipient/);
  });

  it('should reject v2 validators without feeRecipient at any level', () => {
    const keystore = {
      schemaVersion: 2,
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
        },
      ],
    };

    // v2 requires feeRecipient at either validator or top level
    expect(() => keystoreSchema.parse(keystore)).toThrow(/feeRecipient/);
  });

  it('should accept v2 validators with only some having feeRecipient if top-level is set', () => {
    const keystore = {
      schemaVersion: 2,
      feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
      validators: [
        {
          attester: '0x1111111111111111111111111111111111111111111111111111111111111111',
        },
        {
          attester: '0x2222222222222222222222222222222222222222222222222222222222222222',
          feeRecipient: '0x0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcdef0bcd',
        },
      ],
    };

    expect(() => keystoreSchema.parse(keystore)).not.toThrow();
  });

  describe('Strict schema validation', () => {
    it('should reject v2 structure claiming to be schemaVersion 1', () => {
      // This has v2-only fields (top-level publisher) but claims to be v1
      const keystore = {
        schemaVersion: 1,
        publisher: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
          },
        ],
      };

      // v1 schema is strict and doesn't allow publisher field
      expect(() => keystoreSchema.parse(keystore)).toThrow(/publisher/);
    });

    it('should reject v1 keystore with top-level coinbase field', () => {
      const keystore = {
        schemaVersion: 1,
        coinbase: '0x1111111111111111111111111111111111111111',
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
          },
        ],
      };

      expect(() => keystoreSchema.parse(keystore)).toThrow(/coinbase/);
    });

    it('should reject v1 keystore with top-level feeRecipient field', () => {
      const keystore = {
        schemaVersion: 1,
        feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
        validators: [
          {
            attester: '0x1111111111111111111111111111111111111111111111111111111111111111',
            feeRecipient: '0x2222222222222222222222222222222222222222222222222222222222222222',
          },
        ],
      };

      expect(() => keystoreSchema.parse(keystore)).toThrow(/feeRecipient/);
    });

    it('should reject v1 keystores with unknown fields', () => {
      const keystore = {
        schemaVersion: 1,
        unknownField: 'some value',
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
            feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
          },
        ],
      };

      // Strict mode should reject unknown fields
      expect(() => keystoreSchema.parse(keystore)).toThrow(/unknownField/);
    });

    it('should reject v2 keystores with unknown fields', () => {
      const keystore = {
        schemaVersion: 2,
        unknownField: 'some value',
        feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
        validators: [
          {
            attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
          },
        ],
      };

      // Strict mode should reject unknown fields
      expect(() => keystoreSchema.parse(keystore)).toThrow(/unknownField/);
    });
  });
});
