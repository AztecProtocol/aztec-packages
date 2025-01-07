import { type RollupContract } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';

import { type PublicClient } from 'viem';

/** Utility class that polls the chain on quick intervals and logs new L1 blocks, L2 blocks, and L2 proofs. */
export class ChainMonitor {
  private readonly l1Client: PublicClient;
  private handle: NodeJS.Timeout | undefined;

  /** Current L1 block number */
  public l1BlockNumber!: number;
  /** Current L2 block number */
  public l2BlockNumber!: number;
  /** Current L2 proven block number */
  public l2ProvenBlockNumber!: number;

  constructor(
    private readonly rollup: RollupContract,
    private logger = createLogger('aztecjs:utils:chain_monitor'),
    private readonly intervalMs = 200,
  ) {
    this.l1Client = rollup.client;
  }

  start() {
    if (this.handle) {
      throw new Error('Chain monitor already started');
    }
    this.handle = setInterval(() => this.run(), this.intervalMs);
  }

  stop() {
    if (this.handle) {
      clearInterval(this.handle!);
      this.handle = undefined;
    }
  }

  async run() {
    const newL1BlockNumber = Number(await this.l1Client.getBlockNumber({ cacheTime: 0 }));
    if (this.l1BlockNumber === newL1BlockNumber) {
      return;
    }
    this.l1BlockNumber = newL1BlockNumber;

    const block = await this.l1Client.getBlock({ blockNumber: BigInt(newL1BlockNumber), includeTransactions: false });
    const timestamp = block.timestamp;
    const timestampString = new Date(Number(timestamp) * 1000).toTimeString().split(' ')[0];

    let msg = `L1 block ${newL1BlockNumber} mined at ${timestampString}`;

    const newL2BlockNumber = Number(await this.rollup.getBlockNumber());
    if (this.l2BlockNumber !== newL2BlockNumber) {
      const epochNumber = await this.rollup.getEpochNumber(BigInt(newL2BlockNumber));
      msg += ` with new L2 block ${newL2BlockNumber} for epoch ${epochNumber}`;
      this.l2BlockNumber = newL2BlockNumber;
    }

    const newL2ProvenBlockNumber = Number(await this.rollup.getProvenBlockNumber());
    if (this.l2ProvenBlockNumber !== newL2ProvenBlockNumber) {
      const epochNumber = await this.rollup.getEpochNumber(BigInt(newL2ProvenBlockNumber));
      msg += ` with proof up to L2 block ${newL2ProvenBlockNumber} for epoch ${epochNumber}`;
      this.l2ProvenBlockNumber = newL2ProvenBlockNumber;
    }

    this.logger.info(msg, {
      l1Timestamp: timestamp,
      l1BlockNumber: this.l1BlockNumber,
      l2BlockNumber: this.l2BlockNumber,
      l2ProvenBlockNumber: this.l2ProvenBlockNumber,
    });
  }
}
