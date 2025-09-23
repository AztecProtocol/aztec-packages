import { pick } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { L1TxUtils, TxUtilsState } from './l1_tx_utils.js';

const sortOrder = [TxUtilsState.IDLE, TxUtilsState.MINED];
const invalidStates = [TxUtilsState.SENT, TxUtilsState.SPEED_UP, TxUtilsState.CANCELLED, TxUtilsState.NOT_MINED]; // Cancelled and not mined are states that can be handled by a later iteration

export type PublisherFilter<UtilsType extends L1TxUtils> = (utils: UtilsType) => boolean;

export class PublisherManager<UtilsType extends L1TxUtils = L1TxUtils> {
  private log = createLogger('PublisherManager');
  private config: { publisherAllowInvalidStates?: boolean };

  constructor(
    private publishers: UtilsType[],
    config: { publisherAllowInvalidStates?: boolean },
  ) {
    this.log.info(`PublisherManager initialized with ${publishers.length} publishers.`);
    this.publishers = publishers;
    this.config = pick(config, 'publisherAllowInvalidStates');
  }

  // Finds and prioritises available publishers based on
  // 1. Validity as per the provided filter function
  // 2. Validity based on the state the publisher is in
  // 3. Priority based on state as defined bu sortOrder
  // 4. Then priority based on highest balance
  // 5. Then priority based on least recently used
  public async getAvailablePublisher(filter: PublisherFilter<UtilsType> = () => true): Promise<UtilsType> {
    // Extract the valid publishers
    let validPublishers = this.publishers.filter((pub: UtilsType) => !invalidStates.includes(pub.state) && filter(pub));

    // If none found but we allow invalid states, try again including them
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

    return sortedPublishers[0].publisher;
  }

  public interrupt() {
    this.publishers.forEach(pub => pub.interrupt());
  }
}
