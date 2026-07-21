import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';
import { type Hex, encodeFunctionData } from 'viem';

import { MULTI_CALL_3_ADDRESS, aggregate3ValueAbi } from './contracts/multicall.js';
import { L1TxUtils, TxUtilsState } from './l1_tx_utils/index.js';
import { PublisherManager } from './publisher_manager.js';

/** Encode the expected aggregate3Value calldata for the given addresses and funding amount. */
function expectedFundingData(addresses: EthAddress[], fundingAmount: bigint): Hex {
  return encodeFunctionData({
    abi: aggregate3ValueAbi,
    functionName: 'aggregate3Value',
    args: [
      addresses.map(addr => ({
        target: addr.toString() as `0x${string}`,
        allowFailure: false,
        value: fundingAmount,
        callData: '0x' as Hex,
      })),
    ],
  });
}

describe('PublisherManager', () => {
  let mockPublishers: (TestL1TxUtils & L1TxUtils)[];
  let publisherManager: PublisherManager<L1TxUtils>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await publisherManager?.stop();
  });

  describe('constructor', () => {
    it('should initialize with publishers', () => {
      mockPublishers = createMockPublishers(3);

      expect(() => new PublisherManager(mockPublishers, {})).not.toThrow();
    });
  });

  describe('get available publisher', () => {
    let addresses: EthAddress[];
    beforeEach(() => {
      addresses = Array.from({ length: 3 }, () => EthAddress.random());
      mockPublishers = createMockPublishers(3, addresses);
      publisherManager = new PublisherManager(mockPublishers, {});
    });

    it('should throw error when no valid publishers found', async () => {
      // No publishers are valid
      const filter = () => false;

      await expect(publisherManager.getAvailablePublisher(filter)).rejects.toThrow(
        'Failed to find an available publisher.',
      );
    });

    it('should throw error when all publishers are in invalid states', async () => {
      mockPublishers[0].state = TxUtilsState.SENT;
      mockPublishers[1].state = TxUtilsState.CANCELLED;
      mockPublishers[2].state = TxUtilsState.NOT_MINED;

      await expect(publisherManager.getAvailablePublisher()).rejects.toThrow('Failed to find an available publisher.');
    });

    it('should return a publisher in invalid state if allowed', async () => {
      mockPublishers[0].state = TxUtilsState.SENT;
      mockPublishers[1].state = TxUtilsState.CANCELLED;
      mockPublishers[2].state = TxUtilsState.NOT_MINED;

      publisherManager = new PublisherManager(mockPublishers, { publisherAllowInvalidStates: true });
      await expect(publisherManager.getAvailablePublisher(p => p.state === TxUtilsState.CANCELLED)).resolves.toBe(
        mockPublishers[1],
      );
    });

    it('should return publisher with best state', async () => {
      mockPublishers[0].state = TxUtilsState.MINED;
      mockPublishers[1].state = TxUtilsState.IDLE;
      mockPublishers[2].state = TxUtilsState.MINED;

      mockPublishers[0].balance = 1000n;
      mockPublishers[1].balance = 500n;
      mockPublishers[2].balance = 1500n;

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBe(mockPublishers[1]); // IDLE state has priority
    });

    it('should sort by balance when states are equal', async () => {
      mockPublishers[0].state = TxUtilsState.MINED;
      mockPublishers[1].state = TxUtilsState.MINED;
      mockPublishers[2].state = TxUtilsState.MINED;

      mockPublishers[0].balance = 1000n;
      mockPublishers[1].balance = 2000n;
      mockPublishers[2].balance = 500n;

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBe(mockPublishers[1]); // Highest balance
    });

    it('should sort by lastMinedAtBlockNumber when state and balance comparison are equal', async () => {
      mockPublishers[0].state = TxUtilsState.MINED;
      mockPublishers[1].state = TxUtilsState.MINED;
      mockPublishers[2].state = TxUtilsState.MINED;

      mockPublishers[0].balance = 1000n;
      mockPublishers[1].balance = 1000n;
      mockPublishers[2].balance = 1000n;

      mockPublishers[0].lastMinedAtBlockNumber = 100n;
      mockPublishers[1].lastMinedAtBlockNumber = 50n;
      mockPublishers[2].lastMinedAtBlockNumber = undefined;

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBe(mockPublishers[2]); // undefined (0n) is lowest
    });

    it('should not select a publisher with zero balance', async () => {
      // Publisher 1 is IDLE (best state) but unfunded; a funded publisher should win instead.
      mockPublishers[0].state = TxUtilsState.MINED;
      mockPublishers[0].balance = 1000n;

      mockPublishers[1].state = TxUtilsState.IDLE;
      mockPublishers[1].balance = 0n;

      mockPublishers[2].state = TxUtilsState.MINED;
      mockPublishers[2].balance = 1000n;

      const result = await publisherManager.getAvailablePublisher();

      expect(result).not.toBe(mockPublishers[1]);
    });

    it('falls back to zero-balance publishers when none are funded', async () => {
      mockPublishers.forEach(p => (p.balance = 0n));

      const result = await publisherManager.getAvailablePublisher();

      expect(result).toBeDefined();
    });

    it('should apply filter correctly', async () => {
      mockPublishers[0].state = TxUtilsState.IDLE;
      mockPublishers[1].state = TxUtilsState.MINED;
      mockPublishers[2].state = TxUtilsState.MINED;

      mockPublishers[0].balance = 1000n;
      mockPublishers[1].balance = 1000n;
      mockPublishers[2].balance = 1000n;

      // The first publisher would normally be selected as it is idle but we filter it out
      mockPublishers[0].senderAddress = addresses[0];
      mockPublishers[1].senderAddress = addresses[1];
      mockPublishers[2].senderAddress = addresses[2];

      const filter = (publisher: L1TxUtils) => {
        return !publisher.getSenderAddress().equals(addresses[0]); // Filter out the first publisher
      };

      const result = await publisherManager.getAvailablePublisher(filter);
      expect(result).toBe(mockPublishers[1]); // First valid after filtering
    });

    it('should prioritise same state publishers based on balance and then least recently used', async () => {
      const ethAddresses = Array.from({ length: 5 }, () => EthAddress.random());
      mockPublishers = createMockPublishers(5, ethAddresses);
      publisherManager = new PublisherManager(mockPublishers, {});

      const filter = (utils: L1TxUtils) => utils.getSenderAddress() !== mockPublishers[2].getSenderAddress(); // Filter out publisher in index 2

      // Set up different states, balances, and block numbers
      mockPublishers[0].state = TxUtilsState.MINED;
      mockPublishers[0].balance = 500n;
      mockPublishers[0].lastMinedAtBlockNumber = 200n;

      mockPublishers[1].state = TxUtilsState.IDLE;
      mockPublishers[1].balance = 300n;
      mockPublishers[1].lastMinedAtBlockNumber = undefined;

      // The best candidate in terms of state and balance, but it's filtered out
      mockPublishers[2].state = TxUtilsState.IDLE;
      mockPublishers[2].balance = 10000000000n;
      mockPublishers[2].lastMinedAtBlockNumber = 0n;

      mockPublishers[3].state = TxUtilsState.MINED;
      mockPublishers[3].balance = 800n;
      mockPublishers[3].lastMinedAtBlockNumber = 100n;

      // The best candidate based on state and balance
      mockPublishers[4].state = TxUtilsState.IDLE;
      mockPublishers[4].balance = 600n;
      mockPublishers[4].lastMinedAtBlockNumber = 50n;

      const result = await publisherManager.getAvailablePublisher(filter);

      // IDLE state has priority, and among IDLE publishers, least recently used wins
      expect(result).toBeDefined();
      expect(result!.getSenderAddress()).toEqual(mockPublishers[4].getSenderAddress());

      // Set this publisher to have the same balance as publisher index 1
      mockPublishers[4].balance = 300n;

      // Priority should now go to the one that is least recently used, index 1
      const result2 = await publisherManager.getAvailablePublisher(filter);
      expect(result2).toBeDefined();
      expect(result2!.getSenderAddress()).toEqual(mockPublishers[1].getSenderAddress());
    });
  });

  describe('publisher funding', () => {
    let funder: TestL1TxUtils & L1TxUtils;
    const threshold = 100n;
    const fundingAmount = 50n;

    const createFundedManager = (
      publishers: (TestL1TxUtils & L1TxUtils)[],
      funderInstance?: TestL1TxUtils & L1TxUtils,
      config?: { publisherFundingThreshold?: bigint; publisherFundingAmount?: bigint },
    ) => {
      return new PublisherManager(
        publishers,
        { publisherFundingThreshold: threshold, publisherFundingAmount: fundingAmount, ...config },
        { funder: funderInstance },
      );
    };

    /** Start the manager and trigger one funding cycle via the RunningPromise. */
    const triggerFunding = async (manager: PublisherManager<L1TxUtils>) => {
      await manager.start();
      // RunningPromise calls the fn immediately on start, so we just need to wait for it to settle
      await new Promise(resolve => setTimeout(resolve, 10));
      await manager.stop();
    };

    beforeEach(() => {
      funder = new TestL1TxUtils(EthAddress.random()) as TestL1TxUtils & L1TxUtils;
      funder.balance = 5000n;
    });

    it('funds publisher when balance is below threshold', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 50n; // below threshold
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(1);
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledWith({
        to: MULTI_CALL_3_ADDRESS,
        data: expectedFundingData([mockPublishers[0].getSenderAddress()], fundingAmount),
        value: fundingAmount,
      });
    });

    it('does not fund when publisher balance is above threshold', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 200n; // above threshold
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).not.toHaveBeenCalled();
    });

    it('funds multiple publishers, only those below threshold', async () => {
      mockPublishers = createMockPublishers(3);
      mockPublishers[0].balance = 50n; // below
      mockPublishers[1].balance = 200n; // above
      mockPublishers[2].balance = 30n; // below
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      // Single multicall for both underfunded publishers
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(1);
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledWith({
        to: MULTI_CALL_3_ADDRESS,
        data: expectedFundingData(
          [mockPublishers[0].getSenderAddress(), mockPublishers[2].getSenderAddress()],
          fundingAmount,
        ),
        value: 2n * fundingAmount,
      });
    });

    it('correctly sends the funding transaction', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 50n;
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledWith({
        to: MULTI_CALL_3_ADDRESS,
        data: expectedFundingData([mockPublishers[0].getSenderAddress()], fundingAmount),
        value: fundingAmount,
      });
    });

    it('handles funding transaction failure gracefully', async () => {
      mockPublishers = createMockPublishers(2);
      mockPublishers[0].balance = 50n;
      mockPublishers[1].balance = 50n;
      publisherManager = createFundedManager(mockPublishers, funder);

      funder.sendAndMonitorTransaction.mockRejectedValueOnce(new Error('tx failed'));

      await triggerFunding(publisherManager);

      // Single multicall attempted and failed — error caught by RunningPromise
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(1);
    });

    it('no funding triggered when no funder configured', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 50n;
      publisherManager = new PublisherManager(mockPublishers, {
        publisherFundingThreshold: threshold,
        publisherFundingAmount: fundingAmount,
      });

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).not.toHaveBeenCalled();
    });

    it('no funding triggered when config threshold/amount not set', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 50n;
      publisherManager = createFundedManager(mockPublishers, funder, {
        publisherFundingThreshold: undefined,
        publisherFundingAmount: undefined,
      });

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).not.toHaveBeenCalled();
    });

    it('does not fund when funder balance is less than fundingAmount', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 50n;
      funder.balance = 30n; // less than fundingAmount (50n)
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).not.toHaveBeenCalled();
    });

    it('caps funding to affordable number of publishers', async () => {
      mockPublishers = createMockPublishers(3);
      mockPublishers[0].balance = 10n;
      mockPublishers[1].balance = 10n;
      mockPublishers[2].balance = 10n;
      funder.balance = 2n * fundingAmount; // enough for 2, not 3
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(1);
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledWith({
        to: MULTI_CALL_3_ADDRESS,
        data: expectedFundingData(
          [mockPublishers[0].getSenderAddress(), mockPublishers[1].getSenderAddress()],
          fundingAmount,
        ),
        value: 2n * fundingAmount,
      });
    });

    it('disables funding when funder address matches a publisher', async () => {
      const sharedAddress = EthAddress.random();
      mockPublishers = createMockPublishers(2, [sharedAddress]);
      mockPublishers[0].balance = 50n; // same address as funder
      mockPublishers[1].balance = 50n; // different address, also below threshold
      funder = new TestL1TxUtils(sharedAddress) as TestL1TxUtils & L1TxUtils;
      funder.balance = 5000n;
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      // Funding is fully disabled because funder overlaps with a publisher
      expect(funder.sendAndMonitorTransaction).not.toHaveBeenCalled();
    });

    it('funds publishers in busy states', async () => {
      mockPublishers = createMockPublishers(2);
      mockPublishers[0].balance = 50n;
      mockPublishers[0].state = TxUtilsState.IDLE;
      mockPublishers[1].balance = 50n;
      mockPublishers[1].state = TxUtilsState.SENT; // busy
      publisherManager = createFundedManager(mockPublishers, funder);

      await triggerFunding(publisherManager);

      // Single multicall funds both, even the busy one
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(1);
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledWith({
        to: MULTI_CALL_3_ADDRESS,
        data: expectedFundingData(
          [mockPublishers[0].getSenderAddress(), mockPublishers[1].getSenderAddress()],
          fundingAmount,
        ),
        value: 2n * fundingAmount,
      });
    });
  });

  describe('lifecycle', () => {
    let funder: TestL1TxUtils & L1TxUtils;

    beforeEach(() => {
      funder = new TestL1TxUtils(EthAddress.random()) as TestL1TxUtils & L1TxUtils;
      funder.balance = 5000n;
    });

    it('stop interrupts all publishers and the funder', async () => {
      mockPublishers = createMockPublishers(3);
      publisherManager = new PublisherManager(mockPublishers, {}, { funder });

      await publisherManager.start();
      await publisherManager.stop();

      expect(mockPublishers.every(p => p.interrupted)).toBe(true);
      expect(funder.interrupted).toBe(true);
    });

    it('start after stop clears the interrupted flag so publishing works again', async () => {
      mockPublishers = createMockPublishers(3);
      publisherManager = new PublisherManager(mockPublishers, {}, { funder });

      await publisherManager.start();
      await publisherManager.stop();
      expect(mockPublishers.every(p => p.interrupted)).toBe(true);

      // Restart: interrupted must be cleared, otherwise sendTransaction would throw InterruptError.
      await publisherManager.start();

      expect(mockPublishers.every(p => !p.interrupted)).toBe(true);
      expect(funder.interrupted).toBe(false);
    });

    it('a second start does not reload state, which would duplicate background monitors', async () => {
      mockPublishers = createMockPublishers(1);
      publisherManager = new PublisherManager(mockPublishers, {});

      await publisherManager.start();
      await publisherManager.start();

      expect(mockPublishers[0].loadCount).toBe(1);
    });

    it('a start after a stop reloads state so in-flight txs resume monitoring', async () => {
      mockPublishers = createMockPublishers(1);
      publisherManager = new PublisherManager(mockPublishers, {});

      await publisherManager.start();
      await publisherManager.stop();
      await publisherManager.start();

      expect(mockPublishers[0].loadCount).toBe(2);
    });

    it('a failed start can be retried', async () => {
      mockPublishers = createMockPublishers(1);
      publisherManager = new PublisherManager(mockPublishers, {});

      mockPublishers[0].failNextLoad = true;
      await expect(publisherManager.start()).rejects.toThrow('load failed');

      await publisherManager.start();
      expect(mockPublishers[0].loadCount).toBe(1);
    });

    it('is idempotent on double stop', async () => {
      mockPublishers = createMockPublishers(2);
      publisherManager = new PublisherManager(mockPublishers, {});

      await publisherManager.start();
      await publisherManager.stop();
      await expect(publisherManager.stop()).resolves.not.toThrow();

      expect(mockPublishers.every(p => p.interrupted)).toBe(true);
    });

    it('resumes periodic funding checks after a restart', async () => {
      mockPublishers = createMockPublishers(1);
      mockPublishers[0].balance = 50n; // stays below threshold, so every funding check funds it
      publisherManager = new PublisherManager(
        mockPublishers,
        { publisherFundingThreshold: 100n, publisherFundingAmount: 50n },
        { funder },
      );

      await publisherManager.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      await publisherManager.stop();
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(1);

      // The funding loop must be re-armed by the restart, triggering another immediate check.
      await publisherManager.start();
      await new Promise(resolve => setTimeout(resolve, 10));
      await publisherManager.stop();
      expect(funder.sendAndMonitorTransaction).toHaveBeenCalledTimes(2);
    });
  });

  function createMockPublishers(count: number, addresses: EthAddress[] = []): (TestL1TxUtils & L1TxUtils)[] {
    const tempAddress = [...addresses];
    return times(
      count,
      () => new TestL1TxUtils(tempAddress.shift() || EthAddress.random()) as TestL1TxUtils & L1TxUtils,
    );
  }
});

class TestL1TxUtils {
  public state: TxUtilsState = TxUtilsState.IDLE;
  public lastMinedAtBlockNumber: bigint | undefined = undefined;
  public balance: bigint = 1000n;
  /** Mirrors the real ReadOnlyL1TxUtils.interrupted flag so tests can assert publishing is re-enabled. */
  public interrupted = false;
  public loadCount = 0;
  public failNextLoad = false;
  public sendAndMonitorTransaction = jest.fn<() => Promise<any>>().mockResolvedValue({
    receipt: { transactionHash: '0xabc', status: 'success' },
    state: {},
  });

  constructor(public senderAddress: EthAddress) {}

  public getSenderBalance() {
    return Promise.resolve(this.balance);
  }

  public getSenderAddress() {
    return this.senderAddress;
  }

  public loadStateAndResumeMonitoring() {
    if (this.failNextLoad) {
      this.failNextLoad = false;
      return Promise.reject(new Error('load failed'));
    }
    this.loadCount++;
    return Promise.resolve();
  }

  public interrupt() {
    this.interrupted = true;
  }

  public restart() {
    this.interrupted = false;
  }

  public waitMonitoringStopped(_timeoutSeconds = 10) {
    return Promise.resolve();
  }
}
