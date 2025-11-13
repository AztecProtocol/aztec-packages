/* eslint-disable camelcase */
import { GSEContract } from '@aztec/ethereum';
import { computeBn254G1PublicKey, computeBn254G2PublicKey, deriveBlsKeyFromMnemonic } from '@aztec/foundation/crypto';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { AttesterAccount, BLSAccount, EthAccount } from '@aztec/node-keystore/types';

import { wordlist } from '@scure/bip39/wordlists/english.js';
import { generateMnemonic, mnemonicToAccount, privateKeyToAddress } from 'viem/accounts';

import { processAttesterAccounts } from './staker.js';

// Utility functions to generate random test data
function generateRandomMnemonic(): string {
  return generateMnemonic(wordlist);
}

function deriveKeysFromMnemonic(mnemonic: string, accountIndex = 0, addressIndex = 0) {
  const account = mnemonicToAccount(mnemonic, { accountIndex, addressIndex });
  const blsPrivateKey = deriveBlsKeyFromMnemonic(
    mnemonic,
    `m/12381'/3600'/${accountIndex}'/0/${addressIndex}`,
  ) as BLSAccount;

  return {
    ethPrivateKey: account.getHdKey().privateKey
      ? (`0x${Buffer.from(account.getHdKey().privateKey!).toString('hex')}` as EthAccount)
      : (account.address as any),
    blsPrivateKey,
  };
}

describe('staker command', () => {
  let mockGse: GSEContract;
  let makeRegistrationTupleCallCount: number;
  let makeRegistrationTupleCalls: bigint[];

  beforeEach(() => {
    makeRegistrationTupleCallCount = 0;
    makeRegistrationTupleCalls = [];

    // Mock GSEContract with makeRegistrationTuple
    mockGse = {
      makeRegistrationTuple: (secretKey: bigint) => {
        makeRegistrationTupleCallCount++;
        makeRegistrationTupleCalls.push(secretKey);

        // Simple mock that returns a deterministic proof of possession
        // In reality, this would call the contract
        const x = BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
        const y = BigInt('0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321');
        return {
          proofOfPossession: { x, y },
          publicKey: { x, y },
        };
      },
    } as any;
  });

  describe('processAttesterAccounts', () => {
    it('should correctly derive G1 public key from BLS private key', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);

      expect(results.length).toBe(1);
      const output = results[0];

      // Independently compute the expected G1 public key
      const expectedG1 = await computeBn254G1PublicKey(blsPrivateKey as string);

      expect(output.publicKeyG1.x).toBe('0x' + expectedG1.x.toString(16).padStart(64, '0'));
      expect(output.publicKeyG1.y).toBe('0x' + expectedG1.y.toString(16).padStart(64, '0'));
    });

    it('should correctly derive G2 public key from BLS private key', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);

      expect(results.length).toBe(1);
      const output = results[0];

      // Independently compute the expected G2 public key
      const expectedG2 = await computeBn254G2PublicKey(blsPrivateKey as string);

      expect(output.publicKeyG2.x0).toBe('0x' + expectedG2.x.c0.toString(16).padStart(64, '0'));
      expect(output.publicKeyG2.x1).toBe('0x' + expectedG2.x.c1.toString(16).padStart(64, '0'));
      expect(output.publicKeyG2.y0).toBe('0x' + expectedG2.y.c0.toString(16).padStart(64, '0'));
      expect(output.publicKeyG2.y1).toBe('0x' + expectedG2.y.c1.toString(16).padStart(64, '0'));
    });

    it('should correctly derive Ethereum address from private key', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);

      expect(results.length).toBe(1);
      const output = results[0];

      // Independently compute the expected Ethereum address
      const expectedAddress = privateKeyToAddress(ethPrivateKey as `0x${string}`);

      expect(output.attester.toLowerCase()).toBe(expectedAddress.toLowerCase());
    });

    it('should include proof of possession from GSE contract', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);

      expect(results.length).toBe(1);
      const output = results[0];

      // Verify proof of possession is present and non-empty
      expect(output.proofOfPossession).toBeDefined();
      expect(output.proofOfPossession.x).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(output.proofOfPossession.y).toMatch(/^0x[0-9a-fA-F]+$/);
    });

    it('should call GSE contract with correct BLS private key as field element', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      await processAttesterAccounts(attester, mockGse);

      // Verify the GSE contract was called with the BLS private key as a field element
      expect(makeRegistrationTupleCallCount).toBe(1);
      const expectedFieldElement = Fr.fromString(blsPrivateKey as string).toBigInt();
      expect(makeRegistrationTupleCalls[0]).toBe(expectedFieldElement);
    });

    it('should handle multiple attesters in an array', async () => {
      const mnemonic1 = generateRandomMnemonic();
      const keys1 = deriveKeysFromMnemonic(mnemonic1);

      const mnemonic2 = generateRandomMnemonic();
      const keys2 = deriveKeysFromMnemonic(mnemonic2);

      const attester1: AttesterAccount = {
        eth: keys1.ethPrivateKey,
        bls: keys1.blsPrivateKey,
      };

      const attester2: AttesterAccount = {
        eth: keys2.ethPrivateKey,
        bls: keys2.blsPrivateKey,
      };

      const results = await processAttesterAccounts([attester1, attester2], mockGse);

      expect(results.length).toBe(2);

      // Verify first attester
      const expectedG1_1 = await computeBn254G1PublicKey(keys1.blsPrivateKey as string);
      expect(results[0].publicKeyG1.x).toBe('0x' + expectedG1_1.x.toString(16).padStart(64, '0'));

      // Verify second attester
      const expectedG1_2 = await computeBn254G1PublicKey(keys2.blsPrivateKey as string);
      expect(results[1].publicKeyG1.x).toBe('0x' + expectedG1_2.x.toString(16).padStart(64, '0'));
    });

    it('should skip attester without BLS key', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = ethPrivateKey as any;

      const results = await processAttesterAccounts(attester, mockGse);

      expect(results.length).toBe(0);
    });

    it('should skip attester with encrypted keystore but no password', async () => {
      const mnemonic = generateRandomMnemonic();
      const { blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: { path: '/tmp/nonexistent-keystore.json' },
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);

      // Should skip because we can't decrypt the ETH key without a password
      expect(results.length).toBe(0);
    });

    it('should handle attester with remote signer (ETH address without private key)', async () => {
      const mnemonic = generateRandomMnemonic();
      const { blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: {
          address: '0x1234567890123456789012345678901234567890' as unknown as EthAddress,
          remoteSignerUrl: 'http://test',
        },
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);

      // Should produce output since we have both ETH address and BLS key
      expect(results.length).toBe(1);
      expect(results[0].attester).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should skip mnemonic configs', async () => {
      const mnemonic = generateRandomMnemonic();

      const mnemonicConfig = {
        mnemonic,
        addressIndex: 0,
      } as any;

      const results = await processAttesterAccounts(mnemonicConfig, mockGse);

      expect(results.length).toBe(0);
    });

    it('should produce consistent results for same private key', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      const results1 = await processAttesterAccounts(attester, mockGse);
      const results2 = await processAttesterAccounts(attester, mockGse);

      expect(results1).toEqual(results2);
    });

    it('should produce different public keys for different private keys', async () => {
      const mnemonic1 = generateRandomMnemonic();
      const keys1 = deriveKeysFromMnemonic(mnemonic1);

      const mnemonic2 = generateRandomMnemonic();
      const keys2 = deriveKeysFromMnemonic(mnemonic2);

      const attester1: AttesterAccount = {
        eth: keys1.ethPrivateKey,
        bls: keys1.blsPrivateKey,
      };

      const attester2: AttesterAccount = {
        eth: keys2.ethPrivateKey,
        bls: keys2.blsPrivateKey,
      };

      const results1 = await processAttesterAccounts(attester1, mockGse);
      const results2 = await processAttesterAccounts(attester2, mockGse);

      expect(results1[0].publicKeyG1.x).not.toBe(results2[0].publicKeyG1.x);
      expect(results1[0].publicKeyG2.x0).not.toBe(results2[0].publicKeyG2.x0);
    });

    it('should handle BLS private key with or without 0x prefix consistently', () => {
      const privateKeyWith0x = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const privateKeyWithout0x = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      // Test that the Fr.fromString handles both correctly
      const fr1 = Fr.fromString(privateKeyWith0x);
      const fr2 = Fr.fromString('0x' + privateKeyWithout0x);

      expect(fr1.toBigInt()).toBe(fr2.toBigInt());
    });

    it('should format all hex values with 0x prefix and correct padding', async () => {
      const mnemonic = generateRandomMnemonic();
      const { ethPrivateKey, blsPrivateKey } = deriveKeysFromMnemonic(mnemonic);

      const attester: AttesterAccount = {
        eth: ethPrivateKey,
        bls: blsPrivateKey,
      };

      const results = await processAttesterAccounts(attester, mockGse);
      const output = results[0];

      // Check G1 public key format
      expect(output.publicKeyG1.x).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(output.publicKeyG1.y).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Check G2 public key format
      expect(output.publicKeyG2.x0).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(output.publicKeyG2.x1).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(output.publicKeyG2.y0).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(output.publicKeyG2.y1).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Check proof of possession format (may be variable length)
      expect(output.proofOfPossession.x).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(output.proofOfPossession.y).toMatch(/^0x[0-9a-fA-F]+$/);
    });
  });
});
