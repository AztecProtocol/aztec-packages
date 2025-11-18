import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildValidatorEntries, withValidatorIndex } from './shared.js';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('validator keys utilities (legacy LEGACY_BLS_CLI)', () => {
  let tmp: string;
  let feeRecipient: AztecAddress;

  beforeAll(async () => {
    feeRecipient = await AztecAddress.random();
    tmp = mkdtempSync(join(tmpdir(), 'aztec-valkeys-legacy-'));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe('withValidatorIndex with legacy BLS CLI', () => {
    it('Uses address index to change parts[3]', () => {
      process.env.LEGACY_BLS_CLI = 'true';
      const out = withValidatorIndex('m/12381/3600/0/0/0', 5, 3);
      expect(out).toBe('m/12381/3600/3/0/0');
      delete process.env.LEGACY_BLS_CLI;
    });
    it('Returns path unchanged for non-BLS paths in legacy mode', () => {
      process.env.LEGACY_BLS_CLI = 'true';
      const ethPath = 'm/44/60/33/0/33';
      const out = withValidatorIndex(ethPath, 5, 3);
      expect(out).toBe(ethPath);
      delete process.env.LEGACY_BLS_CLI;
    });

    it('Returns path unchanged for BLS paths with different length in legacy mode', () => {
      process.env.LEGACY_BLS_CLI = 'true';
      const shortPath = 'm/12381/3600/0/0';
      const out = withValidatorIndex(shortPath, 5, 3);
      expect(out).toBe(shortPath);
      delete process.env.LEGACY_BLS_CLI;
    });

    it('Returns path unchanged for non-default BLS paths in legacy mode', () => {
      process.env.LEGACY_BLS_CLI = 'true';
      const customPath = 'm/12381/3600/33/0/33';
      const out = withValidatorIndex(customPath, 5, 3);
      expect(out).toBe(customPath);
      delete process.env.LEGACY_BLS_CLI;
    });
  });

  describe('buildValidatorEntries with legacy BLS CLI', () => {
    it('does NOT derive different BLS keys when account index changes, but does derive different ETH keys, with legacy BLS CLI', async () => {
      process.env.LEGACY_BLS_CLI = 'true';
      const { validators: v1 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      const { validators: v2 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 1,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      const att1 = v1[0].attester as any;
      const att2 = v2[0].attester as any;
      expect(att1.bls).toBeDefined();
      expect(att2.bls).toBeDefined();
      expect(att1.bls).toBe(att2.bls);
      expect(att1.eth).not.toEqual(att2.eth);
      delete process.env.LEGACY_BLS_CLI;
    });

    // when using legacy, we expect behaviour to revert to what it was before this fix:
    // https://github.com/AztecProtocol/aztec-packages/pull/18430/commits/c8d38cb6f3c40bbe64fee7830cd0d4509b5933e1
    it('Using count in legacy generates different BLS keys, by appending addressIndex value to parts[3]', async () => {
      process.env.LEGACY_BLS_CLI = 'true';
      const { validators: v1 } = await buildValidatorEntries({
        validatorCount: 2,
        publisherCount: 0,
        accountIndex: 0,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      const att1 = v1[0].attester as any;
      const att2 = v1[1].attester as any;

      expect(att1.bls).toBeDefined();
      expect(att2.bls).toBeDefined();
      expect(att1.bls).not.toEqual(att2.bls);

      // build single validator with address index 1
      const { validators: v3 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 0,
        // we expect the 2nd BLS key above to have been generated at address index 1
        baseAddressIndex: 1,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      const att3 = v3[0].attester as any;
      expect(att3.bls).toBeDefined();
      expect(att3.bls).not.toEqual(att1.bls);
      expect(att3.bls).toEqual(att2.bls);
      delete process.env.LEGACY_BLS_CLI;

      // Without legacy, then we expect the same result when we use accountIndex instead of address index.
      const { validators: v4 } = await buildValidatorEntries({
        validatorCount: 1,
        publisherCount: 0,
        accountIndex: 1,
        baseAddressIndex: 0,
        mnemonic: TEST_MNEMONIC,
        feeRecipient: feeRecipient,
      });
      const att4 = v4[0].attester as any;
      expect(att4.bls).toBeDefined();
      expect(att4.bls).toEqual(att2.bls);
      expect(att4.bls).toEqual(att3.bls);
      expect(att4.bls).not.toEqual(att1.bls);
    });
  });
});
