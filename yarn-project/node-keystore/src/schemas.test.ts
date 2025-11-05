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
const loadExample = (filename: string) => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const examplePath = join(currentDir, '..', 'examples', filename);
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
      parsed.validators![0].feeRecipient.equals(
        AztecAddress.fromString('0x1234567890123456789012345678901234567890123456789012345678901234'),
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
    expect(v0.attester.eth).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(v0.attester.bls).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
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
    expect(parsed.fundingAccount).toBe('0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
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
      schemaVersion: 2, // Invalid
      validators: [
        {
          attester: '0x1234567890123456789012345678901234567890123456789012345678901234',
          feeRecipient: '0x1234567890123456789012345678901234567890123456789012345678901234',
        },
      ],
    };

    expect(() => keystoreSchema.parse(keystore)).toThrow();
  });

  it('should reject keystore without validators or prover', () => {
    const keystore = {
      schemaVersion: 1,
    };

    expect(() => keystoreSchema.parse(keystore)).toThrow();
  });
});
