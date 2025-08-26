import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { L1TxUtils, TxUtilsState } from './l1_tx_utils.js';
import { PublisherManager } from './publisher_manager.js';

describe('PublisherManager', () => {
  let mockPublishers: MockProxy<L1TxUtils>[];
  let publisherManager: PublisherManager<L1TxUtils>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with publishers', () => {
      mockPublishers = createMockPublishers(3);

      expect(() => new PublisherManager(mockPublishers)).not.toThrow();
    });
  });

  describe('getAvailablePublisher', () => {
    let addresses: EthAddress[];
    beforeEach(() => {
      addresses = Array.from({ length: 3 }, () => EthAddress.random());
      mockPublishers = createMockPublishers(3, addresses);
      publisherManager = new PublisherManager(mockPublishers);
    });

    it('should throw error when no valid publishers found', async () => {
      // No publishers are valid
      const filter = () => false;

      await expect(publisherManager.getAvailablePublisher(filter)).rejects.toThrow(
        'Failed to find an available publisher.',
      );
    });

    it('should throw error when all publishers are in invalid states', async () => {
      mockPublishers[0]['state'] = TxUtilsState.SENT;
      mockPublishers[1]['state'] = TxUtilsState.CANCELLED;
      mockPublishers[2]['state'] = TxUtilsState.NOT_MINED;

      await expect(publisherManager.getAvailablePublisher()).rejects.toThrow('Failed to find an available publisher.');
    });

    it('should return publisher with highest priority (IDLE state)', async () => {
      mockPublishers[0]['state'] = TxUtilsState.MINED;
      mockPublishers[1]['state'] = TxUtilsState.IDLE;
      mockPublishers[2]['state'] = TxUtilsState.MINED;

      mockPublishers[0].getSenderBalance.mockResolvedValue(1000n);
      mockPublishers[1].getSenderBalance.mockResolvedValue(500n);
      mockPublishers[2].getSenderBalance.mockResolvedValue(1500n);

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBe(mockPublishers[1]); // IDLE state has priority
    });

    it('should sort by balance when states are equal', async () => {
      mockPublishers[0]['state'] = TxUtilsState.MINED;
      mockPublishers[1]['state'] = TxUtilsState.MINED;
      mockPublishers[2]['state'] = TxUtilsState.MINED;

      mockPublishers[0].getSenderBalance.mockResolvedValue(1000n);
      mockPublishers[1].getSenderBalance.mockResolvedValue(2000n);
      mockPublishers[2].getSenderBalance.mockResolvedValue(500n);

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBe(mockPublishers[1]); // Highest balance
    });

    it('should sort by lastMinedAtBlockNumber when state and balance comparison are equal', async () => {
      mockPublishers[0]['state'] = TxUtilsState.MINED;
      mockPublishers[1]['state'] = TxUtilsState.MINED;
      mockPublishers[2]['state'] = TxUtilsState.MINED;

      mockPublishers[0].getSenderBalance.mockResolvedValue(1000n);
      mockPublishers[1].getSenderBalance.mockResolvedValue(1000n);
      mockPublishers[2].getSenderBalance.mockResolvedValue(1000n);

      mockPublishers[0]['lastMinedAtBlockNumber'] = 100n;
      mockPublishers[1]['lastMinedAtBlockNumber'] = 50n;
      mockPublishers[2]['lastMinedAtBlockNumber'] = undefined;

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBe(mockPublishers[2]); // undefined (0n) is lowest
    });

    it('should apply filter correctly', async () => {
      mockPublishers[0]['state'] = TxUtilsState.IDLE;
      mockPublishers[1]['state'] = TxUtilsState.MINED;
      mockPublishers[2]['state'] = TxUtilsState.MINED;

      mockPublishers[0].getSenderBalance.mockResolvedValue(1000n);
      mockPublishers[1].getSenderBalance.mockResolvedValue(1000n);
      mockPublishers[2].getSenderBalance.mockResolvedValue(1000n);

      // The first publisher would normally be selected as it is idle but we filter it out
      mockPublishers[0].getSenderAddress.mockReturnValue(addresses[0]);
      mockPublishers[1].getSenderAddress.mockReturnValue(addresses[1]);
      mockPublishers[2].getSenderAddress.mockReturnValue(addresses[2]);

      const filter = (publisher: L1TxUtils) => {
        return !publisher.getSenderAddress().equals(addresses[0]); // Filter out the first publisher
      };

      const result = await publisherManager.getAvailablePublisher(filter);
      expect(result).toBe(mockPublishers[1]); // First valid after filtering
    });

    it('should handle complex sorting scenario', async () => {
      const ethAddresses = Array.from({ length: 5 }, () => EthAddress.random());
      mockPublishers = createMockPublishers(5, ethAddresses);
      publisherManager = new PublisherManager(mockPublishers);

      const filter = (utils: L1TxUtils) => utils.getSenderAddress() !== mockPublishers[2].getSenderAddress(); // Filter out publisher in index 2

      // Set up different states, balances, and block numbers
      mockPublishers[0]['state'] = TxUtilsState.MINED;
      mockPublishers[0].getSenderBalance.mockResolvedValue(500n);
      mockPublishers[0]['lastMinedAtBlockNumber'] = 200n;

      mockPublishers[1]['state'] = TxUtilsState.IDLE;
      mockPublishers[1].getSenderBalance.mockResolvedValue(300n);
      mockPublishers[1]['lastMinedAtBlockNumber'] = undefined;

      // The best candidate in terms of state and last block, but it's filtered out
      mockPublishers[2]['state'] = TxUtilsState.IDLE;
      mockPublishers[2].getSenderBalance.mockResolvedValue(10000000000n);
      mockPublishers[2]['lastMinedAtBlockNumber'] = 0n;

      mockPublishers[3]['state'] = TxUtilsState.MINED;
      mockPublishers[3].getSenderBalance.mockResolvedValue(800n);
      mockPublishers[3]['lastMinedAtBlockNumber'] = 100n;

      mockPublishers[4]['state'] = TxUtilsState.IDLE;
      mockPublishers[4].getSenderBalance.mockResolvedValue(600n);
      mockPublishers[4]['lastMinedAtBlockNumber'] = 50n;

      const result = await publisherManager.getAvailablePublisher(filter);

      // IDLE state has priority, and among IDLE publishers, least recently used wins
      expect(result).toBeDefined();
      expect(result!.getSenderAddress()).toEqual(mockPublishers[1].getSenderAddress());

      // Set this publisher to be the same last mined block
      mockPublishers[1]['lastMinedAtBlockNumber'] = 50n;

      // Priority should now go to the one with the highest balance
      const result2 = await publisherManager.getAvailablePublisher(filter);
      expect(result2).toBeDefined();
      expect(result2!.getSenderAddress()).toEqual(mockPublishers[4].getSenderAddress());
    });
  });

  function createMockPublishers(count: number, addresses: EthAddress[] = []): MockProxy<L1TxUtils>[] {
    const tempAddress = [...addresses];
    return Array.from({ length: count }, () => {
      return mock<L1TxUtils>({
        state: TxUtilsState.IDLE,
        lastMinedAtBlockNumber: undefined,
        getSenderBalance: jest.fn().mockReturnValue(Promise.resolve(1000n)),
        getSenderAddress: jest.fn().mockReturnValue(tempAddress.shift() || EthAddress.random()),
      } as MockProxy<L1TxUtils>);
    });
  }
});
