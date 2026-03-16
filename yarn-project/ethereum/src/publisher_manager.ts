import { pick } from '@aztec/foundation/collection';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';

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
  private isFunding = false;
  private funder?: UtilsType;

  constructor(
    private publishers: UtilsType[],
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
  }

  /** Loads the state of all publishers and resumes monitoring any pending txs */
  public async loadState(): Promise<void> {
    await Promise.all(this.publishers.map(pub => pub.loadStateAndResumeMonitoring()));
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

    // Sort based on state, then balance, then time since last use
    const sortedPublishers = publishersWithBalance.sort((a, b) => {
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

    void this.triggerFundingIfNeeded().catch(err => this.log.error('Error in funding check', { err }));

    return sortedPublishers[0].publisher;
  }

  public interrupt() {
    this.publishers.forEach(pub => pub.interrupt());
  }

  /** Check all publisher balances and fund those below threshold (background, non-blocking). */
  private async triggerFundingIfNeeded(): Promise<void> {
    const { funder, config } = this;
    if (!funder || config.publisherFundingThreshold === undefined || config.publisherFundingAmount === undefined) {
      return;
    }
    if (this.isFunding) {
      return;
    }

    this.isFunding = true;
    try {
      const allBalances = await Promise.all(
        this.publishers.map(async pub => ({ balance: await pub.getSenderBalance(), publisher: pub })),
      );
      const lowBalance = allBalances.filter(p => p.balance < config.publisherFundingThreshold!);
      if (lowBalance.length === 0) {
        return;
      }

      const fundingAmount = config.publisherFundingAmount!;
      let funderBalance = await funder.getSenderBalance();

      if (funderBalance < 10n * fundingAmount) {
        this.log.warn(`Funding account balance is low`, { funderBalance, threshold: 10n * fundingAmount });
      }
      if (funderBalance < fundingAmount) {
        this.log.error(`Funding account balance too low to fund any publisher`, { funderBalance, fundingAmount });
        return;
      }

      await this.fundPublishers(lowBalance.map(p => p.publisher));
    } finally {
      this.isFunding = false;
    }
  }

  /** Fund publishers sequentially. Re-reads funder balance after each transfer. */
  private async fundPublishers(publishers: UtilsType[]): Promise<void> {
    const fundingAmount = this.config.publisherFundingAmount!;

    for (const publisher of publishers) {
      const address = publisher.getSenderAddress();
      try {
        this.log.info(`Funding publisher ${address}`, { fundingAmount });
        await this.funder!.sendAndMonitorTransaction({ to: address.toString(), data: '0x', value: fundingAmount });
        this.log.info(`Funded publisher ${address}`);
      } catch (err) {
        this.log.error(`Failed to fund publisher ${address}`, { err });
        continue;
      }

      const funderBalance = await this.funder!.getSenderBalance();
      if (funderBalance < fundingAmount) {
        this.log.warn(`Funder exhausted after funding, stopping`, { funderBalance, fundingAmount });
        break;
      }
    }
  }
}
