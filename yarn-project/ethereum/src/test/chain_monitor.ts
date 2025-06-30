import { InboxContract, type RollupContract } from '@aztec/ethereum/contracts';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';

import { EventEmitter } from 'events';

import type { ViemClient } from '../types.js';

export type ChainMonitorEventMap = {
  'l1-block': [{ l1BlockNumber: number; timestamp: bigint }];
  'l2-block': [{ l2BlockNumber: number; l1BlockNumber: number; timestamp: bigint }];
  'l2-block-proven': [{ l2ProvenBlockNumber: number; l1BlockNumber: number; timestamp: bigint }];
  'l2-messages': [{ totalL2Messages: number; l1BlockNumber: number }];
};

/** Utility class that polls the chain on quick intervals and logs new L1 blocks, L2 blocks, and L2 proofs. */
export class ChainMonitor extends EventEmitter<ChainMonitorEventMap> {
  private readonly l1Client: ViemClient;
  private inbox: InboxContract | undefined;
  private handle: NodeJS.Timeout | undefined;
  private running: Set<Promise<void>> = new Set();

  /** Current L1 block number */
  public l1BlockNumber!: number;
  /** Current L2 block number */
  public l2BlockNumber!: number;
  /** Current L2 proven block number */
  public l2ProvenBlockNumber!: number;
  /** L1 timestamp for the current L2 block */
  public l2BlockTimestamp!: bigint;
  /** L1 timestamp for the proven L2 block */
  public l2ProvenBlockTimestamp!: bigint;
  /** Total number of L2 messages pushed into the Inbox */
  public totalL2Messages: number = 0;

  constructor(
    private readonly rollup: RollupContract,
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly logger = createLogger('aztecjs:utils:chain_monitor'),
    private readonly intervalMs = 200,
  ) {
    super();
    this.l1Client = rollup.client;
  }

  start() {
    if (this.handle) {
      throw new Error('Chain monitor already started');
    }
    this.handle = setInterval(this.safeRun.bind(this), this.intervalMs);
    return this;
  }

  async stop() {
    try {
      this.removeAllListeners();
      if (this.handle) {
        clearInterval(this.handle!);
        this.handle = undefined;
      }
      await Promise.allSettled([...this.running]);
    } catch (err) {
      this.logger.error('Error stopping chain monitor', err);
    }
  }

  private async getInbox() {
    if (!this.inbox) {
      const { inboxAddress } = await this.rollup.getRollupAddresses();
      this.inbox = new InboxContract(this.l1Client, inboxAddress);
    }
    return this.inbox;
  }

  protected safeRun() {
    const running = promiseWithResolvers<void>();
    this.running.add(running.promise);

    void this.run()
      .catch(error => {
        this.logger.error('Error in chain monitor loop', error);
      })
      .finally(() => {
        running.resolve();
        this.running.delete(running.promise);
      });
  }

  async run(force = false) {
    const newL1BlockNumber = Number(await this.l1Client.getBlockNumber({ cacheTime: 0 }));
    if (!force && this.l1BlockNumber === newL1BlockNumber) {
      return this;
    }
    this.l1BlockNumber = newL1BlockNumber;

    const block = await this.l1Client.getBlock({ blockNumber: BigInt(newL1BlockNumber), includeTransactions: false });
    const timestamp = block.timestamp;
    const timestampString = new Date(Number(timestamp) * 1000).toTimeString().split(' ')[0];

    this.emit('l1-block', { l1BlockNumber: newL1BlockNumber, timestamp });
    let msg = `L1 block ${newL1BlockNumber} mined at ${timestampString}`;

    const newL2BlockNumber = Number(await this.rollup.getBlockNumber());
    if (this.l2BlockNumber !== newL2BlockNumber) {
      const epochNumber = await this.rollup.getEpochNumber(BigInt(newL2BlockNumber));
      msg += ` with new L2 block ${newL2BlockNumber} for epoch ${epochNumber}`;
      this.l2BlockNumber = newL2BlockNumber;
      this.l2BlockTimestamp = timestamp;
      this.emit('l2-block', { l2BlockNumber: newL2BlockNumber, l1BlockNumber: newL1BlockNumber, timestamp });
    }

    const newL2ProvenBlockNumber = Number(await this.rollup.getProvenBlockNumber());
    if (this.l2ProvenBlockNumber !== newL2ProvenBlockNumber) {
      const epochNumber = await this.rollup.getEpochNumber(BigInt(newL2ProvenBlockNumber));
      msg += ` with proof up to L2 block ${newL2ProvenBlockNumber} for epoch ${epochNumber}`;
      this.l2ProvenBlockNumber = newL2ProvenBlockNumber;
      this.l2ProvenBlockTimestamp = timestamp;
      this.emit('l2-block-proven', {
        l2ProvenBlockNumber: newL2ProvenBlockNumber,
        l1BlockNumber: newL1BlockNumber,
        timestamp,
      });
    }

    const inbox = await this.getInbox();
    const newTotalL2Messages = await inbox.getState().then(s => Number(s.totalMessagesInserted));
    if (this.totalL2Messages !== newTotalL2Messages) {
      msg += ` with ${newTotalL2Messages - this.totalL2Messages} new L2 messages (total ${newTotalL2Messages})`;
      this.totalL2Messages = newTotalL2Messages;
      this.emit('l2-messages', { totalL2Messages: newTotalL2Messages, l1BlockNumber: newL1BlockNumber });
    }

    this.logger.info(msg, {
      currentTimestamp: this.dateProvider.nowInSeconds(),
      l1Timestamp: timestamp,
      l1BlockNumber: this.l1BlockNumber,
      l2SlotNumber: await this.rollup.getSlotNumber(),
      l2BlockNumber: this.l2BlockNumber,
      l2ProvenBlockNumber: this.l2ProvenBlockNumber,
      totalL2Messages: this.totalL2Messages,
    });

    return this;
  }
}
