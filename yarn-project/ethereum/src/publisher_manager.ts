import { pick } from '@aztec/foundation/collection';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import { Multicall3 } from './contracts/multicall.js';
import { L1TxUtils, TxUtilsState } from './l1_tx_utils/index.js';

// Defines the order in which we prioritise publishers based on their state (first is better)
const sortOrder = [
  // Always prefer sending from idle publishers
  TxUtilsState.IDLE,
  // Then from publishers that have sent a tx and it got mined
  TxUtilsState.MINED,
  // Then from publishers that have sent a tx but it's in-flight
  TxUtilsState.SPEED_UP,
  TxUtilsState.SENT,
  // We leave cancelled and not-mined states for last, since these represent failures to mines and could be problematic
  TxUtilsState.CANCELLED,
  TxUtilsState.NOT_MINED,
];

// Which states represent a busy publisher that we should avoid if possible
const busyStates: TxUtilsState[] = [
  TxUtilsState.SENT,
  TxUtilsState.SPEED_UP,
  TxUtilsState.CANCELLED,
  TxUtilsState.NOT_MINED,
];

export type PublisherFilter<UtilsType extends L1TxUtils> = (utils: UtilsType) => boolean;

/** Config accepted by PublisherManager. */
type PublisherManagerConfig = {
  publisherAllowInvalidStates?: boolean;
  publisherFundingThreshold?: bigint;
  publisherFundingAmount?: bigint;
};

export class PublisherManager<UtilsType extends L1TxUtils = L1TxUtils> {
  private log: Logger;
  private config: PublisherManagerConfig;
  private static readonly FUNDING_CHECK_INTERVAL_MS = 2 * 60 * 1000;
  protected funder?: UtilsType;
  protected readonly fundingPromise?: RunningPromise;
  private started = false;

  constructor(
    protected publishers: UtilsType[],
    config: PublisherManagerConfig,
    opts?: { bindings?: LoggerBindings; funder?: UtilsType },
  ) {
    this.funder = opts?.funder;
    this.log = createLogger('publisher:manager', opts?.bindings);
    this.log.info(`PublisherManager initialized with ${publishers.length} publishers.`);
    this.publishers = publishers;
    this.config = pick(config, 'publisherAllowInvalidStates', 'publisherFundingThreshold', 'publisherFundingAmount');

    const hasThreshold = this.config.publisherFundingThreshold !== undefined;
    const hasAmount = this.config.publisherFundingAmount !== undefined;
    if (hasThreshold !== hasAmount) {
      this.log.warn(`Incomplete funding config: both publisherFundingThreshold and publisherFundingAmount must be set`);
    }

    if (this.funder) {
      const funderAddress = this.funder.getSenderAddress();
      if (publishers.some(p => p.getSenderAddress().equals(funderAddress))) {
        this.log.error(`Funding account ${funderAddress} is also a publisher, disabling funding to avoid self-funding`);
        this.funder = undefined;
      }
    }

    if (this.funder && hasThreshold && hasAmount) {
      this.fundingPromise = new RunningPromise(
        () => this.triggerFundingIfNeeded(),
        this.log,
        PublisherManager.FUNDING_CHECK_INTERVAL_MS,
      );
    }
  }

  /**
   * Clears any interrupted flag left by a previous {@link stop} so publishing works again after a restart,
   * loads the state of all publishers and the funder, and starts periodic funding checks. Idempotent: a
   * start while already started is a no-op, so it never re-runs `loadStateAndResumeMonitoring` (which
   * would spawn a duplicate background monitor per pending nonce). Lifecycle calls are expected to be
   * serialized by the caller.
   */
  public async start(): Promise<void> {
    if (this.started) {
      this.log.debug('PublisherManager already started, ignoring start');
      return;
    }

    // Clear the interrupted flag set by a previous stop() so a restarted manager can publish again.
    // On a first start this is a no-op (the flag is already clear).
    this.publishers.forEach(pub => pub.restart());
    this.funder?.restart();

    await Promise.all([
      ...this.publishers.map(pub => pub.loadStateAndResumeMonitoring()),
      this.funder?.loadStateAndResumeMonitoring(),
    ]);

    this.fundingPromise?.start();
    // Marked started only once fully up, so a start that failed to load state can be retried.
    this.started = true;
  }

  /**
   * Stops the funding loop, interrupts all publishers so no further L1 txs are sent, and waits (bounded)
   * for their in-flight tx monitor loops to wind down. Idempotent, and the manager may be restarted
   * afterwards via {@link start}, which clears the interrupted flag.
   */
  public async stop(): Promise<void> {
    this.started = false;
    await this.fundingPromise?.stop();
    this.publishers.forEach(pub => pub.interrupt());
    this.funder?.interrupt();
    // Wait for in-flight tx monitor loops to observe the interrupt, so no L1 requests are still
    // being issued after shutdown (e.g. against an anvil instance a test is about to tear down).
    await Promise.all([
      ...this.publishers.map(pub => pub.waitMonitoringStopped()),
      this.funder?.waitMonitoringStopped(),
    ]);
  }

  // Finds and prioritises available publishers based on
  // 1. Validity as per the provided filter function
  // 2. Validity based on the state the publisher is in
  // 3. Priority based on state as defined by sortOrder
  // 4. Then priority based on highest balance
  // 5. Then priority based on least recently used
  public async getAvailablePublisher(filter: PublisherFilter<UtilsType> = () => true): Promise<UtilsType> {
    this.log.debug(`Getting available publisher`, {
      publishers: this.publishers.map(p => ({
        address: p.getSenderAddress(),
        state: p.state,
        lastMined: p.lastMinedAtBlockNumber,
      })),
    });

    // Extract the valid publishers
    let validPublishers = this.publishers.filter((pub: UtilsType) => !busyStates.includes(pub.state) && filter(pub));

    // If none found but we allow invalid (busy) states, try again including them
    if (validPublishers.length === 0 && this.config.publisherAllowInvalidStates) {
      this.log.warn(`No valid publishers found. Trying again including invalid states.`);
      validPublishers = this.publishers.filter(pub => filter(pub));
    }

    // Error if none found
    if (validPublishers.length === 0) {
      throw new Error(`Failed to find an available publisher.`);
    }

    // Get the balances
    const publishersWithBalance = await Promise.all(
      validPublishers.map(async pub => {
        return { balance: await pub.getSenderBalance(), publisher: pub };
      }),
    );

    // Discount unfunded publishers: a publisher with no ETH cannot send a tx, so it must never win
    // selection regardless of how favourable its state or last-used time is. Fall back to the full
    // set only if every candidate is unfunded, so behaviour is no worse than before.
    let fundedPublishers = publishersWithBalance.filter(p => p.balance > 0n);
    if (fundedPublishers.length === 0) {
      this.log.warn(`All candidate publishers have zero balance; selecting from unfunded publishers.`);
      fundedPublishers = publishersWithBalance;
    }

    // Sort based on state, then balance, then time since last use
    const sortedPublishers = fundedPublishers.sort((a, b) => {
      const stateComparison = sortOrder.indexOf(a.publisher.state) - sortOrder.indexOf(b.publisher.state);
      if (stateComparison !== 0) {
        return stateComparison;
      }
      const balanceComparison = Number(b.balance - a.balance);
      if (balanceComparison !== 0) {
        return balanceComparison;
      }
      const lastUsedComparison = Number(
        (a.publisher.lastMinedAtBlockNumber ?? 0n) - (b.publisher.lastMinedAtBlockNumber ?? 0n),
      );
      return lastUsedComparison;
    });

    return sortedPublishers[0].publisher;
  }

  /** Check all publisher balances and fund those below threshold. */
  private async triggerFundingIfNeeded(): Promise<void> {
    const { funder, config } = this;
    if (!funder || config.publisherFundingThreshold === undefined || config.publisherFundingAmount === undefined) {
      return;
    }

    const allBalances = await Promise.all(
      this.publishers.map(async pub => ({ balance: await pub.getSenderBalance(), publisher: pub })),
    );
    const lowBalance = allBalances.filter(p => p.balance < config.publisherFundingThreshold!);
    if (lowBalance.length === 0) {
      return;
    }

    const fundingAmount = config.publisherFundingAmount!;
    const funderBalance = await funder.getSenderBalance();

    if (funderBalance < 10n * fundingAmount) {
      this.log.warn(`Funding account balance is low`, { funderBalance, threshold: 10n * fundingAmount });
    }
    const affordableCount = Number(funderBalance / fundingAmount);
    if (affordableCount === 0) {
      this.log.error(`Funding account balance too low to fund any publisher`, { funderBalance, fundingAmount });
      return;
    }
    if (affordableCount < lowBalance.length) {
      this.log.warn(`Funder can only afford ${affordableCount}/${lowBalance.length} publishers`, {
        funderBalance,
        fundingAmount,
      });
    }

    const toFund = lowBalance.slice(0, affordableCount).map(p => p.publisher);
    await this.fundPublishers(toFund);
  }

  /** Fund publishers via a single Multicall3 aggregate3Value transaction. */
  private async fundPublishers(publishers: UtilsType[]): Promise<void> {
    const fundingAmount = this.config.publisherFundingAmount!;
    const calls = publishers.map(pub => ({
      to: pub.getSenderAddress().toString(),
      value: fundingAmount,
    }));

    await Multicall3.forwardValue(calls, this.funder!, this.log);
    this.log.info(`Funded ${publishers.length} publishers`);
  }
}
