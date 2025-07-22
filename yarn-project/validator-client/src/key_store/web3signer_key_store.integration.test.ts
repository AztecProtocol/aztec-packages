import { Buffer32 } from '@aztec/foundation/buffer';
import { makeEthSignDigest, recoverAddress } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type TypedDataDefinition, hashTypedData } from 'viem';

import { LocalKeyStore } from './local_key_store.js';
import { Web3SignerKeyStore } from './web3signer_key_store.js';

describe('Web3SignerKeyStore Integration Tests', () => {
  const WEB3_SIGNER_URL = 'http://localhost:9000';
  // use private keys below to test the integration
  const TEST_PUBLIC_KEYS = [
    '0x04e9dc57e53a8ff559c8fd7c0f210807f99a988c36c3e7866d31f65dde5b7bd48c2ea599382eab085965c9082643f84a9b7a8ef243a29b2f85626a3a37f71ecf9e',
    '0x0473d51e7b3c620957c2330a6784d150a109d38ca9c13e29838eed2ac0379b67b88b3d16a0ec9f6ac4711a186c73813eab7b1ae22d50f62bb5f74861f02ee11f07',
  ] as `0x${string}`[];
  const TEST_PRIVATE_KEYS = [
    '0x8ffb92ad70251c494427cd918b80b7627d4a958863b0d97e7c5466c20c9b572f',
    '0x51b3404134b767dafdd8756a38a71e9f2b11be7a4ec792d089c3d6dd07841489',
  ] as `0x${string}`[];

  // Derive addresses from private keys for testing
  let TEST_ADDRESSES: `0x${string}`[];
  let keyStore: Web3SignerKeyStore;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // Create a local keystore to derive the expected addresses
    const localKeystore = new LocalKeyStore(TEST_PRIVATE_KEYS.map(pk => Buffer32.fromString(pk)));
    TEST_ADDRESSES = localKeystore.getAddresses().map(addr => addr.toString() as `0x${string}`);
    keyStore = new Web3SignerKeyStore(
      // TEST_PUBLIC_KEYS.map(pk => Buffer.from(pk)),
      TEST_PUBLIC_KEYS,
      WEB3_SIGNER_URL,
    );
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Unit Tests (Mocked)', () => {
    let mockFetch: jest.MockedFunction<typeof fetch>;

    beforeEach(() => {
      mockFetch = jest.fn();
      globalThis.fetch = mockFetch;
    });

    it('should get addresses correctly', () => {
      const addresses = keyStore.getAddresses();
      expect(addresses).toHaveLength(TEST_ADDRESSES.length);
      // Verify addresses are properly derived EthAddress instances
      addresses.forEach((address, index) => {
        expect(address).toBeInstanceOf(EthAddress);
        expect(address.toString()).toBe(TEST_ADDRESSES[index]);
      });
    });

    it('should get address by index', () => {
      const addresses = keyStore.getAddresses();
      expect(keyStore.getAddress(0)).toEqual(addresses[0]);
    });

    it('should throw error for invalid index', () => {
      expect(() => keyStore.getAddress(2)).toThrow('Index 2 is out of bounds.');
    });

    it('should sign with all addresses', async () => {
      const digest = Buffer32.random();
      const mockSignature =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

      // Mock JSON-RPC responses for each address
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: mockSignature,
          }),
      } as Response);

      const signatures = await keyStore.signMessage(digest);

      expect(signatures).toHaveLength(TEST_ADDRESSES.length);
      // Each address requires 1 JSON-RPC call
      expect(mockFetch).toHaveBeenCalledTimes(TEST_ADDRESSES.length);
    });

    it('should sign with specific address', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0); // Get the first derived address
      const mockSignature =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: mockSignature,
          }),
      } as Response);

      const signature = await keyStore.signMessageWithAddress(address, digest);

      expect(signature).toBeInstanceOf(Signature);
      expect(mockFetch).toHaveBeenCalledWith(WEB3_SIGNER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sign',
          params: [address.toString(), digest.toString()],
          id: 1,
        }),
      });
    });

    it('should throw error for unknown address', async () => {
      const digest = Buffer32.random();
      const unknownAddress = EthAddress.fromString('0x9999999999999999999999999999999999999999');

      await expect(keyStore.signMessageWithAddress(unknownAddress, digest)).rejects.toThrow(
        `Address ${unknownAddress.toString()} not found in keystore`,
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should sign message with all addresses', async () => {
      const message = Buffer32.random();
      const mockSignature =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: mockSignature,
          }),
      } as Response);

      const signatures = await keyStore.signMessage(message);

      expect(signatures).toHaveLength(TEST_ADDRESSES.length);
      expect(mockFetch).toHaveBeenCalledTimes(TEST_ADDRESSES.length);
    });

    it('should sign message with specific address', async () => {
      const message = Buffer32.random();
      const address = keyStore.getAddress(1); // Get the second derived address
      const mockSignature =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: mockSignature,
          }),
      } as Response);

      const signature = await keyStore.signMessageWithAddress(address, message);

      expect(signature).toBeInstanceOf(Signature);
      expect(mockFetch).toHaveBeenCalledWith(WEB3_SIGNER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sign',
          params: [address.toString(), message.toString()],
          id: 1,
        }),
      });
    });

    it('should handle JSON-RPC response format', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0);
      const mockSignature =
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: mockSignature,
          }),
      } as Response);

      const signature = await keyStore.signMessageWithAddress(address, digest);

      expect(signature).toBeInstanceOf(Signature);
    });

    it('should handle direct hex string response without 0x prefix', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0);
      const mockSignature =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b'; // No 0x prefix

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: mockSignature,
          }),
      } as Response);

      const signature = await keyStore.signMessageWithAddress(address, digest);

      expect(signature).toBeInstanceOf(Signature);
    });

    it('should handle Web3Signer JSON-RPC errors', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            error: {
              code: -32602,
              message: 'Invalid params',
            },
          }),
      } as Response);

      await expect(keyStore.signMessageWithAddress(address, digest)).rejects.toThrow(
        'Web3Signer JSON-RPC error: -32602 - Invalid params',
      );
    });

    it('should handle HTTP errors', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid signing request'),
      } as Response);

      await expect(keyStore.signMessageWithAddress(address, digest)).rejects.toThrow(
        'Web3Signer request failed: 400 Bad Request - Invalid signing request',
      );
    });

    it('should handle network errors', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0);

      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(keyStore.signMessageWithAddress(address, digest)).rejects.toThrow('Network error');
    });

    it('should handle empty response', async () => {
      const digest = Buffer32.random();
      const address = keyStore.getAddress(0);

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            id: 1,
            result: null,
          }),
      } as Response);

      await expect(keyStore.signMessageWithAddress(address, digest)).rejects.toThrow(
        'Invalid response from Web3Signer: no result found',
      );
    });
  });

  describe('Integration Tests (Real Web3Signer)', () => {
    // These tests require a running Web3Signer instance at localhost:9000
    // They are marked as conditional and will be skipped if Web3Signer is not available
    const isWeb3SignerAvailable = async (): Promise<boolean> => {
      try {
        const response = await fetch(`${WEB3_SIGNER_URL}/upcheck`, { method: 'GET' });
        return response.ok;
      } catch {
        return false;
      }
    };

    it('should connect to real Web3Signer service', async () => {
      const available = await isWeb3SignerAvailable();
      if (!available) {
        throw new Error('Web3Signer not available at localhost:9000. Please start it in order to run this test.');
      }

      // This test would only pass if Web3Signer is properly configured with the test addresses
      expect(available).toBe(true);
    });

    it('should eth_sign data with real Web3Signer (requires manual setup)', async () => {
      // This test is skipped by default because it requires:
      // 1. Web3Signer running at localhost:9000
      // 2. Proper key configuration matching TEST_ADDRESSES
      // 3. Manual verification of the setup

      const available = await isWeb3SignerAvailable();
      if (!available) {
        throw new Error('Web3Signer not available at localhost:9000');
      }

      const digest = Buffer32.fromString('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      const address = keyStore.getAddress(0);
      const localKeystore = new LocalKeyStore(TEST_PRIVATE_KEYS.map(privateKey => Buffer32.fromString(privateKey)));
      const localAddress = localKeystore.getAddress(0);

      expect(address.toString()).toBe(localAddress.toString());

      const signature = await keyStore.signMessageWithAddress(address, digest);

      // For Web3Signer (eth_sign), we  use makeEthSignDigest on recovery
      // because eth_sign automatically applies Ethereum message prefixing
      const ethSignDigest = makeEthSignDigest(digest);
      const recoveredWithEthDigest = recoverAddress(ethSignDigest, signature);

      expect(recoveredWithEthDigest.toString()).toBe(address.toString());

      expect(signature).toBeInstanceOf(Signature);
    });

    it.only('should sign raw data with real Web3Signer (requires manual setup)', async () => {
      const available = await isWeb3SignerAvailable();
      if (!available) {
        throw new Error('Web3Signer not available at localhost:9000');
      }

      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          Person: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' },
          ],
          Mail: [
            { name: 'from', type: 'Person' },
            { name: 'to', type: 'Person' },
            { name: 'contents', type: 'string' },
          ],
        },
        primaryType: 'Mail',
        domain: {
          name: 'Ether Mail',
          version: '1',
          chainId: 1,
          verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' as `0x${string}`,
        },
        message: {
          from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
          to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
          contents: 'Hello, Bob!',
        },
      };
      const address = keyStore.getAddress(0);

      const signature = await keyStore.signTypedDataWithAddress(address, typedData);

      expect(signature).toBeInstanceOf(Signature);

      const hash = hashTypedData(typedData as TypedDataDefinition);
      const recoveredAddress = recoverAddress(Buffer32.fromString(hash), signature);

      expect(address.toString()).toBe(recoveredAddress.toString());
    });
  });

  describe('Configuration and Setup', () => {
    it('should handle different URL formats', () => {
      const testUrls = ['http://localhost:9000', 'https://web3signer.example.com', 'http://192.168.1.100:9000'];

      testUrls.forEach(url => {
        const store = new Web3SignerKeyStore(TEST_PUBLIC_KEYS, url);
        expect((store as any).baseUrl).toBe(url);
      });
    });

    it('should store addresses correctly', () => {
      const addresses = keyStore.getAddresses();
      expect(addresses).toHaveLength(TEST_ADDRESSES.length);
      // Each address should be a valid EthAddress
      addresses.forEach((address, index) => {
        expect(address).toBeInstanceOf(EthAddress);
        expect(address.toString()).toBe(TEST_ADDRESSES[index]);
        expect(address.toString()).toMatch(/^0x[a-fA-F0-9]{40}$/);
      });
    });
  });
});
