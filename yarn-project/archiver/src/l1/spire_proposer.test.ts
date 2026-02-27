import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import { type MockProxy, mock } from 'jest-mock-extended';
import { type Hex, type Transaction, encodeFunctionData } from 'viem';

import {
  EIP1967_IMPLEMENTATION_SLOT,
  SPIRE_PROPOSER_ADDRESS,
  SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION,
  SpireProposerAbi,
  getCallsFromSpireProposer,
  verifyProxyImplementation,
} from './spire_proposer.js';

describe('Spire Proposer', () => {
  let publicClient: MockProxy<{ getStorageAt: (params: { address: Hex; slot: Hex }) => Promise<Hex | undefined> }>;
  let logger: Logger;

  const txHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;

  beforeEach(() => {
    publicClient = mock<{ getStorageAt: (params: { address: Hex; slot: Hex }) => Promise<Hex | undefined> }>();
    logger = createLogger('archiver:test:spire_proposer');
  });

  describe('verifyProxyImplementation', () => {
    it('should return true when proxy points to expected implementation', async () => {
      // Mock storage slot containing the implementation address (padded to 32 bytes)
      publicClient.getStorageAt.mockResolvedValue(
        ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
      );

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(true);
      expect(publicClient.getStorageAt).toHaveBeenCalledWith({
        address: SPIRE_PROPOSER_ADDRESS,
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
    });

    it('should return true when proxy points to expected implementation with different casing', async () => {
      // Mock storage slot with uppercase address
      const uppercaseImpl = SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.toUpperCase();
      publicClient.getStorageAt.mockResolvedValue(('0x000000000000000000000000' + uppercaseImpl.slice(2)) as Hex);

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(true);
    });

    it('should return false when proxy points to different implementation', async () => {
      // Mock storage slot with wrong implementation (must be valid address format)
      const wrongImplementation = EthAddress.random().toString();
      publicClient.getStorageAt.mockResolvedValue(('0x000000000000000000000000' + wrongImplementation.slice(2)) as Hex);

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(false);
    });

    it('should return false when storage slot is empty', async () => {
      publicClient.getStorageAt.mockResolvedValue(undefined);

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(false);
    });

    it('should return false when getStorageAt throws error', async () => {
      publicClient.getStorageAt.mockRejectedValue(new Error('RPC error'));

      const result = await verifyProxyImplementation(
        publicClient,
        SPIRE_PROPOSER_ADDRESS as Hex,
        SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION as Hex,
        logger,
      );

      expect(result).toBe(false);
    });
  });

  describe('getCallsFromSpireProposer', () => {
    function makeSpireProposerMulticallTransaction(...calls: { target: Hex; data: Hex }[]): Transaction {
      const spireMulticallData = encodeFunctionData({
        abi: SpireProposerAbi,
        functionName: 'multicall',
        args: [
          calls.map(call => ({
            proposer: EthAddress.random().toString() as Hex,
            target: call.target,
            data: call.data,
            value: 0n,
            gasLimit: 1000000n,
          })),
        ],
      });

      return {
        input: spireMulticallData,
        to: SPIRE_PROPOSER_ADDRESS as Hex,
        hash: txHash,
      } as Transaction;
    }

    describe('successful decoding', () => {
      beforeEach(() => {
        // Mock successful proxy verification
        publicClient.getStorageAt.mockResolvedValue(
          ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
        );
      });

      it('should decode Spire Proposer with single call', async () => {
        const targetAddress = EthAddress.random().toString() as Hex;
        const calldata = '0x12345678' as Hex;
        const tx = makeSpireProposerMulticallTransaction({
          target: targetAddress,
          data: calldata,
        });

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result![0].to.toLowerCase()).toBe(targetAddress.toLowerCase());
        expect(result![0].data).toBe(calldata);
        expect(publicClient.getStorageAt).toHaveBeenCalledWith({
          address: SPIRE_PROPOSER_ADDRESS,
          slot: EIP1967_IMPLEMENTATION_SLOT,
        });
      });

      it('should extract call with any target address (validation happens later)', async () => {
        const unknownAddress = EthAddress.random().toString() as Hex;
        const tx = makeSpireProposerMulticallTransaction({
          target: unknownAddress,
          data: '0xabcdef' as Hex,
        });

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result![0].to.toLowerCase()).toBe(unknownAddress.toLowerCase());
        expect(result![0].data).toBe('0xabcdef');
      });

      it('should preserve exact calldata bytes', async () => {
        const complexCalldata =
          '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
        const tx = makeSpireProposerMulticallTransaction({
          target: EthAddress.random().toString() as Hex,
          data: complexCalldata,
        });

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeDefined();
        expect(result).toHaveLength(1);
        expect(result![0].data).toBe(complexCalldata);
      });
    });

    describe('validation failures', () => {
      it('should return undefined when not to Spire Proposer address', async () => {
        const tx = {
          input: '0x12345678' as Hex,
          to: EthAddress.random().toString() as Hex,
          hash: txHash,
        } as Transaction;

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeUndefined();
        expect(publicClient.getStorageAt).not.toHaveBeenCalled();
      });

      it('should return undefined when to is null', async () => {
        const tx = {
          input: '0x12345678' as Hex,
          to: null,
          hash: txHash,
        } as Transaction;

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeUndefined();
        expect(publicClient.getStorageAt).not.toHaveBeenCalled();
      });

      it('should return undefined when to is undefined', async () => {
        const tx = {
          input: '0x12345678' as Hex,
          to: undefined,
          hash: txHash,
        } as unknown as Transaction;

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeUndefined();
      });

      it('should return undefined when proxy implementation verification fails', async () => {
        const tx = makeSpireProposerMulticallTransaction({
          target: EthAddress.random().toString() as Hex,
          data: '0x12345678' as Hex,
        });

        // Mock the proxy pointing to wrong implementation
        publicClient.getStorageAt.mockResolvedValue('0x00000000000000000000000000000000000000000000000000bad' as Hex);

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeUndefined();
      });

      it('should return undefined when function is not multicall', async () => {
        // Create a transaction with a different function
        const wrongFunctionData = '0x12345678' as Hex; // Not a valid multicall

        const tx = {
          input: wrongFunctionData,
          to: SPIRE_PROPOSER_ADDRESS as Hex,
          hash: txHash,
        } as Transaction;

        publicClient.getStorageAt.mockResolvedValue(
          ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
        );

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeUndefined();
      });

      it('should return empty array when Spire Proposer contains zero calls', async () => {
        const spireMulticallData = encodeFunctionData({
          abi: SpireProposerAbi,
          functionName: 'multicall',
          args: [[]],
        });

        const tx = {
          input: spireMulticallData,
          to: SPIRE_PROPOSER_ADDRESS as Hex,
          hash: txHash,
        } as Transaction;

        publicClient.getStorageAt.mockResolvedValue(
          ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
        );

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeDefined();
        expect(result).toHaveLength(0);
      });

      it('should return all calls when Spire Proposer contains multiple calls', async () => {
        const target1 = EthAddress.random().toString() as Hex;
        const target2 = EthAddress.random().toString() as Hex;
        const tx = makeSpireProposerMulticallTransaction(
          { target: target1, data: '0x12345678' as Hex },
          { target: target2, data: '0xabcdef' as Hex },
        );

        publicClient.getStorageAt.mockResolvedValue(
          ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
        );

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeDefined();
        expect(result).toHaveLength(2);
        expect(result![0].to.toLowerCase()).toBe(target1.toLowerCase());
        expect(result![1].to.toLowerCase()).toBe(target2.toLowerCase());
      });

      it('should return undefined when decoding throws exception', async () => {
        const tx = {
          input: '0xdeadbeef' as Hex, // Invalid calldata that will fail to decode
          to: SPIRE_PROPOSER_ADDRESS as Hex,
          hash: txHash,
        } as Transaction;

        publicClient.getStorageAt.mockResolvedValue(
          ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
        );

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeUndefined();
      });
    });

    describe('call parameters', () => {
      beforeEach(() => {
        publicClient.getStorageAt.mockResolvedValue(
          ('0x000000000000000000000000' + SPIRE_PROPOSER_EXPECTED_IMPLEMENTATION.slice(2)) as Hex,
        );
      });

      it('should ignore proposer field in call', async () => {
        const calldata = '0x12345678' as Hex;
        const targetAddress = EthAddress.random().toString() as Hex;

        const spireMulticallData = encodeFunctionData({
          abi: SpireProposerAbi,
          functionName: 'multicall',
          args: [
            [
              {
                proposer: EthAddress.random().toString() as Hex, // Different proposer
                target: targetAddress,
                data: calldata,
                value: 0n,
                gasLimit: 1000000n,
              },
            ],
          ],
        });

        const tx = {
          input: spireMulticallData,
          to: SPIRE_PROPOSER_ADDRESS as Hex,
          hash: txHash,
        } as Transaction;

        const result = await getCallsFromSpireProposer(tx, publicClient, logger);

        expect(result).toBeDefined();
        expect(result![0].to.toLowerCase()).toBe(targetAddress.toLowerCase());
        expect(result![0].data).toBe(calldata);
      });
    });
  });
});
