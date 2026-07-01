import type { ManaMinFeeComponents, RollupContract } from '@aztec/ethereum/contracts';
import { InboxContract } from '@aztec/ethereum/contracts';
import { CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';

import { EventEmitter } from 'events';

import type { ViemClient } from '../types.js';

/** L2 fee data reported by the chain monitor. */
export type L2FeeData = ManaMinFeeComponents & {
  /** Total minimum fee per mana in Fee Juice (sum of sequencerCost + proverCost + congestionCost). */
  minFeePerMana: bigint;
  /** L1 base fee observed by the oracle. */
  l1BaseFee: bigint;
  /** L1 blob fee observed by the oracle. */
  l1BlobFee: bigint;
  /** ETH per fee asset exchange rate (1e12 precision). */
  ethPerFeeAsset: bigint;
  /** Mana target per checkpoint. */
  manaTarget: bigint;
};

export type ChainMonitorEventMap = {
  'l1-block': [{ l1BlockNumber: number; timestamp: bigint }];
  checkpoint: [
    { checkpointNumber: CheckpointNumber; l1BlockNumber: number; l2SlotNumber: SlotNumber; timestamp: bigint },
  ];
  'checkpoint-proven': [{ provenCheckpointNumber: CheckpointNumber; l1BlockNumber: number; timestamp: bigint }];
  'l2-messages': [{ totalL2Messages: number; l1BlockNumber: number }];
  'l2-epoch': [{ l2EpochNumber: EpochNumber; timestamp: bigint; committee: EthAddress[] | undefined }];
  'l2-slot': [{ l2SlotNumber: SlotNumber; timestamp: bigint }];
  'l2-fees': [L2FeeData];
};

/** Options for tuning what the {@link ChainMonitor} polls on each new L1 block. */
export type ChainMonitorOptions = {
  /**
   * Whether to fetch L2 fee/oracle data (5 extra rollup reads per new L1 block) and emit `l2-fees`.
   * Defaults to `true`. Set to `false` for tests that only care about slot/checkpoint/proven state to
   * avoid the extra round-trips.
   */
  includeFeeData?: boolean;
};

/** Utility class that polls the chain on quick intervals and logs new L1 blocks, L2 blocks, and L2 proofs. */
export class ChainMonitor extends EventEmitter<ChainMonitorEventMap> {
  private readonly l1Client: ViemClient;
  private readonly includeFeeData: boolean;
  private inbox: InboxContract | undefined;
  private handle: NodeJS.Timeout | undefined;
  // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
  private running: Set<Promise<void>> = new Set();

  /** Current L1 block number */
  public l1BlockNumber!: number;
  /** Current checkpoint number */
  public checkpointNumber!: CheckpointNumber;
  /** Current proven checkpoint number */
  public provenCheckpointNumber!: CheckpointNumber;
  /** L1 timestamp for the current checkpoint */
  public checkpointTimestamp!: bigint;
  /** L1 timestamp for the proven checkpoint */
  public provenCheckpointTimestamp!: bigint;
  /** Total number of L2 messages pushed into the Inbox */
  public totalL2Messages: number = 0;
  /** Current L2 epoch number */
  public l2EpochNumber!: EpochNumber;
  /** Current L2 slot number */
  public l2SlotNumber!: SlotNumber;
  /** Current L2 fee data (components of the minimum fee per mana). */
  public l2FeeData!: L2FeeData;

  constructor(
    private readonly rollup: RollupContract,
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly logger = createLogger('aztecjs:utils:chain_monitor'),
    private readonly intervalMs = 200,
    options: ChainMonitorOptions = {},
  ) {
    super();
    this.l1Client = rollup.client;
    this.includeFeeData = options.includeFeeData ?? true;
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

  protected async getInbox() {
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

    const [l2SlotNumber, l2Epoch, l1block] = await Promise.all([
      this.rollup.getSlotNumber(),
      this.rollup.getCurrentEpoch(),
      this.l1Client.getBlock({ blockNumber: BigInt(newL1BlockNumber), includeTransactions: false }),
    ]);

    const timestamp = l1block.timestamp;
    const timestampString = new Date(Number(timestamp) * 1000).toTimeString().split(' ')[0];

    this.emit('l1-block', { l1BlockNumber: newL1BlockNumber, timestamp });
    let msg = `L1 block ${newL1BlockNumber} mined at ${timestampString}`;

    const newCheckpointNumber = await this.rollup.getCheckpointNumber();
    if (this.checkpointNumber !== newCheckpointNumber) {
      const epochNumber = await this.rollup.getEpochNumberForCheckpoint(newCheckpointNumber);
      msg += ` with new checkpoint ${newCheckpointNumber} for epoch ${epochNumber}`;
      this.checkpointNumber = newCheckpointNumber;
      this.checkpointTimestamp = timestamp;
      this.emit('checkpoint', {
        checkpointNumber: newCheckpointNumber,
        l1BlockNumber: newL1BlockNumber,
        l2SlotNumber,
        timestamp,
      });
    }

    const newProvenCheckpointNumber = await this.rollup.getProvenCheckpointNumber();
    if (this.provenCheckpointNumber !== newProvenCheckpointNumber) {
      const epochNumber = await this.rollup.getEpochNumberForCheckpoint(newProvenCheckpointNumber);
      msg += ` with proof up to checkpoint ${newProvenCheckpointNumber} for epoch ${epochNumber}`;
      this.provenCheckpointNumber = newProvenCheckpointNumber;
      this.provenCheckpointTimestamp = timestamp;
      this.emit('checkpoint-proven', {
        provenCheckpointNumber: newProvenCheckpointNumber,
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

    let committee: EthAddress[] | undefined;
    if (l2Epoch !== this.l2EpochNumber) {
      this.l2EpochNumber = l2Epoch;
      committee = await this.rollup.getCurrentEpochCommittee();
      this.emit('l2-epoch', { l2EpochNumber: l2Epoch, timestamp, committee });
      msg += ` starting new epoch ${this.l2EpochNumber}`;
    }

    if (l2SlotNumber !== this.l2SlotNumber) {
      this.l2SlotNumber = l2SlotNumber;
      this.emit('l2-slot', { l2SlotNumber, timestamp });
    }

    if (this.includeFeeData) {
      const feeData = await this.fetchFeeData(timestamp);
      if (this.hasFeeDataChanged(feeData)) {
        msg += ` with L2 min fee ${feeData.minFeePerMana}`;
        this.l2FeeData = feeData;
        this.emit('l2-fees', feeData);
      }
    }

    this.logger.info(msg, {
      currentTimestamp: this.dateProvider.nowInSeconds(),
      l1Timestamp: timestamp,
      l1BlockNumber: this.l1BlockNumber,
      l2SlotNumber,
      l2Epoch,
      checkpointNumber: this.checkpointNumber,
      provenCheckpointNumber: this.provenCheckpointNumber,
      totalL2Messages: this.totalL2Messages,
      committee,
      ...this.l2FeeData,
    });

    return this;
  }

  public waitUntilL2Slot(slot: SlotNumber): Promise<void> {
    if (this.l2SlotNumber >= slot) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const listener = (data: { l2SlotNumber: SlotNumber; timestamp: bigint }) => {
        if (data.l2SlotNumber >= slot) {
          this.off('l2-slot', listener);
          resolve();
        }
      };
      this.on('l2-slot', listener);
    });
  }

  public async waitUntilNextL2Slot(): Promise<void> {
    const targetSlot = SlotNumber.add((await this.run()).l2SlotNumber, 1);
    return this.waitUntilL2Slot(targetSlot);
  }

  public waitUntilL1Block(block: number | bigint): Promise<void> {
    const targetBlock = typeof block === 'bigint' ? block.valueOf() : block;
    if (this.l1BlockNumber >= targetBlock) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const listener = (data: { l1BlockNumber: number; timestamp: bigint }) => {
        if (data.l1BlockNumber >= targetBlock) {
          this.off('l1-block', listener);
          resolve();
        }
      };
      this.on('l1-block', listener);
    });
  }

  public waitUntilL1Timestamp(timestamp: number | bigint): Promise<void> {
    const targetTimestamp = typeof timestamp === 'bigint' ? timestamp.valueOf() : timestamp;
    if (this.l1BlockNumber >= targetTimestamp) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const listener = (data: { l1BlockNumber: number; timestamp: bigint }) => {
        if (data.timestamp >= targetTimestamp) {
          this.off('l1-block', listener);
          resolve();
        }
      };
      this.on('l1-block', listener);
    });
  }

  public waitUntilCheckpoint(checkpointNumber: CheckpointNumber): Promise<void> {
    if (this.checkpointNumber >= checkpointNumber) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const listener = (data: { checkpointNumber: CheckpointNumber; timestamp: bigint }) => {
        if (data.checkpointNumber >= checkpointNumber) {
          this.off('checkpoint', listener);
          resolve();
        }
      };
      this.on('checkpoint', listener);
    });
  }

  /**
   * Resolves with the first `checkpoint` event whose payload satisfies `match`. Unlike
   * {@link waitUntilCheckpoint} (which waits for a target number), this lets callers wait for an
   * arbitrary checkpoint property (e.g. one published in the first half of its slot). Rejects after
   * `opts.timeout` ms if provided; otherwise waits indefinitely.
   */
  public waitForCheckpoint(
    match: (event: ChainMonitorEventMap['checkpoint'][0]) => boolean,
    opts: { timeout?: number } = {},
  ): Promise<ChainMonitorEventMap['checkpoint'][0]> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      const listener = (event: ChainMonitorEventMap['checkpoint'][0]) => {
        if (match(event)) {
          if (timer) {
            clearTimeout(timer);
          }
          this.off('checkpoint', listener);
          resolve(event);
        }
      };
      if (opts.timeout !== undefined) {
        timer = setTimeout(() => {
          this.off('checkpoint', listener);
          reject(new Error(`Timed out after ${opts.timeout}ms waiting for a matching checkpoint`));
        }, opts.timeout);
      }
      this.on('checkpoint', listener);
    });
  }

  /** Resolves once the proven checkpoint number reaches `checkpointNumber`. */
  public waitUntilCheckpointProven(checkpointNumber: CheckpointNumber): Promise<void> {
    if (this.provenCheckpointNumber >= checkpointNumber) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const listener = (data: { provenCheckpointNumber: CheckpointNumber; timestamp: bigint }) => {
        if (data.provenCheckpointNumber >= checkpointNumber) {
          this.off('checkpoint-proven', listener);
          resolve();
        }
      };
      this.on('checkpoint-proven', listener);
    });
  }

  private async fetchFeeData(timestamp: bigint): Promise<L2FeeData> {
    const [components, minFeePerMana, l1Fees, ethPerFeeAsset, manaTarget] = await Promise.all([
      this.rollup.getManaMinFeeComponentsAt(timestamp, true),
      this.rollup.getManaMinFeeAt(timestamp, true),
      this.rollup.getL1FeesAt(timestamp),
      this.rollup.getEthPerFeeAsset(),
      this.rollup.getManaTarget(),
    ]);
    return {
      ...components,
      minFeePerMana,
      l1BaseFee: l1Fees.baseFee,
      l1BlobFee: l1Fees.blobFee,
      ethPerFeeAsset,
      manaTarget,
    };
  }

  private hasFeeDataChanged(newData: L2FeeData): boolean {
    if (!this.l2FeeData) {
      return true;
    }
    return (
      this.l2FeeData.sequencerCost !== newData.sequencerCost ||
      this.l2FeeData.proverCost !== newData.proverCost ||
      this.l2FeeData.congestionCost !== newData.congestionCost ||
      this.l2FeeData.l1BaseFee !== newData.l1BaseFee ||
      this.l2FeeData.l1BlobFee !== newData.l1BlobFee ||
      this.l2FeeData.ethPerFeeAsset !== newData.ethPerFeeAsset
    );
  }
}
