/**
 * Tests for Zod schema validation using example files
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { keystoreSchema } from '../src/schemas.js';

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
    expect(parsed.validators).toHaveLength(3);
    expect(parsed.remoteSigner).toBe('https://localhost:8080');
    expect(parsed.slasher).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should validate prover with publishers example', () => {
    const keystore = loadExample('prover-with-publishers-and-funding-account.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.prover).toBe('object');
    expect((parsed.prover as any).id).toBe('0x1234567890123456789012345678901234567890');
    expect((parsed.prover as any).publisher).toHaveLength(2);
    expect(parsed.fundingAccount).toBe('0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
  });

  it('should validate prover with single publisher example', () => {
    const keystore = loadExample('prover-with-single-publisher.json');
    expect(() => keystoreSchema.parse(keystore)).not.toThrow();

    const parsed = keystoreSchema.parse(keystore);
    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.prover).toBe('object');
    expect((parsed.prover as any).id).toBe('0x1234567890123456789012345678901234567890');
    expect((parsed.prover as any).publisher).toBe('0x1234567890123456789012345678901234567890123456789012345678901234');
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
