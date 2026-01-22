import { type Logger, createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import type { ViemClient } from '../../types.js';
import type { L1TxUtilsConfig } from '../config.js';
import { P75AllTxsPriorityFeeStrategy } from './p75_competitive.js';
import type { PriorityFeeStrategy, PriorityFeeStrategyContext } from './types.js';

describe('PriorityFeeStrategy', () => {
  let logger: Logger;

  beforeAll(() => {
    logger = createLogger('ethereum:test:fee-strategies');
  });
  describe('execute runs all RPC calls internally', () => {
    it('P75AllTxsPriorityFeeStrategy executes and returns priority fee with block data', async () => {
      const mockClient = {
        getBlock: jest.fn().mockImplementation((args: any) => {
          if (args.blockTag === 'latest') {
            return Promise.resolve({
              number: 100n,
              baseFeePerGas: 1000000000n,
              transactions: [],
            });
          }
          // pending block
          return Promise.resolve({ transactions: [] });
        }),
        getBlobBaseFee: jest.fn<() => Promise<bigint>>().mockResolvedValue(100000000n),
        estimateMaxPriorityFeePerGas: jest.fn<() => Promise<bigint>>().mockResolvedValue(1000000000n),
        getFeeHistory: jest.fn<() => Promise<{ reward: bigint[][] }>>().mockResolvedValue({ reward: [[1000000000n]] }),
      } as unknown as ViemClient;

      const context: PriorityFeeStrategyContext = {
        gasConfig: {} as L1TxUtilsConfig,
        isBlobTx: false,
        logger,
      };

      const result = await P75AllTxsPriorityFeeStrategy.execute(mockClient, context);

      // Should return priority fee
      expect(result.priorityFee).toBeGreaterThanOrEqual(0n);

      // Should return latest block
      expect(result.latestBlock).toBeDefined();
      expect(result.latestBlock.number).toBe(100n);

      // Should not return blob base fee for non-blob tx
      expect(result.blobBaseFee).toBeUndefined();

      // RPC methods should have been called
      expect(mockClient.getBlock).toHaveBeenCalled();
      expect(mockClient.estimateMaxPriorityFeePerGas).toHaveBeenCalled();
      expect(mockClient.getFeeHistory).toHaveBeenCalled();
    });

    it('returns blob base fee for blob transactions', async () => {
      const mockClient = {
        getBlock: jest.fn().mockImplementation((args: any) => {
          if (args.blockTag === 'latest') {
            return Promise.resolve({
              number: 100n,
              baseFeePerGas: 1000000000n,
              transactions: [],
            });
          }
          return Promise.resolve({ transactions: [] });
        }),
        getBlobBaseFee: jest.fn<() => Promise<bigint>>().mockResolvedValue(500000000n),
        estimateMaxPriorityFeePerGas: jest.fn<() => Promise<bigint>>().mockResolvedValue(1000000000n),
        getFeeHistory: jest.fn<() => Promise<{ reward: bigint[][] }>>().mockResolvedValue({ reward: [[1000000000n]] }),
      } as unknown as ViemClient;

      const context: PriorityFeeStrategyContext = {
        gasConfig: {} as L1TxUtilsConfig,
        isBlobTx: true,
        logger,
      };

      const result = await P75AllTxsPriorityFeeStrategy.execute(mockClient, context);

      // Should return blob base fee for blob tx
      expect(result.blobBaseFee).toBe(500000000n);
      expect(mockClient.getBlobBaseFee).toHaveBeenCalled();
    });

    it('handles RPC failures gracefully', async () => {
      const mockClient = {
        getBlock: jest.fn().mockImplementation((args: any) => {
          if (args.blockTag === 'latest') {
            return Promise.resolve({
              number: 100n,
              baseFeePerGas: 1000000000n,
              transactions: [],
            });
          }
          return Promise.reject(new Error('RPC error'));
        }),
        getBlobBaseFee: jest.fn<() => Promise<bigint>>().mockRejectedValue(new Error('RPC error')),
        estimateMaxPriorityFeePerGas: jest.fn<() => Promise<bigint>>().mockRejectedValue(new Error('RPC error')),
        getFeeHistory: jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('RPC error')),
      } as unknown as ViemClient;

      const context: PriorityFeeStrategyContext = {
        gasConfig: {} as L1TxUtilsConfig,
        isBlobTx: false,
        logger,
      };

      // Should not throw, should return a result (with fallback values)
      const result = await P75AllTxsPriorityFeeStrategy.execute(mockClient, context);

      // Strategy should handle failures gracefully (falls back to 0n)
      expect(result.priorityFee).toBe(0n);
      expect(result.latestBlock).toBeDefined();
    });

    it('throws if latest block fetch fails', async () => {
      const mockClient = {
        getBlock: jest.fn<() => Promise<any>>().mockRejectedValue(new Error('RPC error')),
        getBlobBaseFee: jest.fn<() => Promise<bigint>>().mockResolvedValue(100000000n),
        estimateMaxPriorityFeePerGas: jest.fn<() => Promise<bigint>>().mockResolvedValue(1000000000n),
        getFeeHistory: jest.fn<() => Promise<{ reward: bigint[][] }>>().mockResolvedValue({ reward: [[1000000000n]] }),
      } as unknown as ViemClient;

      const context: PriorityFeeStrategyContext = {
        gasConfig: {} as L1TxUtilsConfig,
        isBlobTx: false,
        logger,
      };

      // Should throw because latest block is required
      await expect(P75AllTxsPriorityFeeStrategy.execute(mockClient, context)).rejects.toThrow(
        'Failed to get latest block',
      );
    });
  });

  describe('custom strategy', () => {
    it('allows custom strategies with execute function', async () => {
      let executeCalled = false;

      const customStrategy: PriorityFeeStrategy = {
        id: 'test-custom',
        name: 'Test Custom Strategy',
        execute: async (client, _context) => {
          executeCalled = true;
          const latestBlock = await client.getBlock({ blockTag: 'latest' });
          return {
            priorityFee: 5000000000n,
            latestBlock,
            debugInfo: { custom: 'test' },
          };
        },
      };

      const mockClient = {
        getBlock: jest.fn<() => Promise<any>>().mockResolvedValue({
          number: 100n,
          baseFeePerGas: 1000000000n,
        }),
      } as unknown as ViemClient;

      const context: PriorityFeeStrategyContext = {
        gasConfig: {} as L1TxUtilsConfig,
        isBlobTx: false,
        logger,
      };

      const result = await customStrategy.execute(mockClient, context);

      expect(executeCalled).toBe(true);
      expect(result.priorityFee).toBe(5000000000n);
      expect(result.latestBlock.number).toBe(100n);
      expect(result.debugInfo).toEqual({ custom: 'test' });
    });
  });
});
