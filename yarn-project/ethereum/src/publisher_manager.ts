import { createLogger } from '@aztec/foundation/log';

import { L1TxUtils, TxUtilsState } from './l1_tx_utils.js';

const sortOrder = [TxUtilsState.IDLE, TxUtilsState.MINED];
const invalidStates = [TxUtilsState.SENT, TxUtilsState.SPEED_UP, TxUtilsState.CANCELLED, TxUtilsState.NOT_MINED]; // Cancelled and not mined are states that can be handled by a later iteration

export class PublisherManager<UtilsType extends L1TxUtils = L1TxUtils> {
  private log = createLogger('PublisherManager');

  constructor(private publishers: UtilsType[]) {
    this.log.info(`PublisherManager initialized with ${publishers.length} publishers.`);
    this.publishers = publishers;
  }

  public async getAvailablePublisher(filter: (utils: UtilsType) => boolean = () => true): Promise<UtilsType> {
    const validPublishers = this.publishers.filter(
      (pub: UtilsType) => filter(pub) && !invalidStates.includes(pub.state),
    );

    if (validPublishers.length === 0) {
      throw new Error(`Failed to find an available publisher.`);
    }

    const publishersWithBalance = await Promise.all(
      validPublishers.map(async pub => {
        return { balance: await pub.getSenderBalance(), publisher: pub };
      }),
    );

    const sortedPublishers = publishersWithBalance.sort((a, b) => {
      const stateComparison = sortOrder.indexOf(a.publisher.state) - sortOrder.indexOf(b.publisher.state);
      const balanceComparison = Number(b.balance - a.balance);
      const lastUsedComparison = Number(
        (a.publisher.lastMinedAtBlockNumber ?? 0n) - (b.publisher.lastMinedAtBlockNumber ?? 0n),
      );

      if (stateComparison !== 0) {
        return stateComparison;
      }
      if (lastUsedComparison !== 0) {
        return lastUsedComparison;
      }
      return balanceComparison;
    });

    return sortedPublishers[0].publisher;
  }

  public interrupt() {
    this.publishers.forEach(pub => pub.interrupt());
  }
}
