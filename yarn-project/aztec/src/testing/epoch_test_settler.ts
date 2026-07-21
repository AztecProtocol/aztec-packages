import { type EthCheatCodes, RollupCheatCodes } from '@aztec/ethereum/test';
import type { EpochNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import { settleEpochOutbox } from '@aztec/prover-client/test';
import { EpochMonitor } from '@aztec/prover-node';
import type { EthAddress, L2BlockSource } from '@aztec/stdlib/block';

export class EpochTestSettler {
  private rollupCheatCodes: RollupCheatCodes;
  private epochMonitor?: EpochMonitor;

  constructor(
    cheatcodes: EthCheatCodes,
    rollupAddress: EthAddress,
    private l2BlockSource: L2BlockSource,
    private log: Logger,
    private options: { pollingIntervalMs: number; provingDelayMs?: number },
  ) {
    this.rollupCheatCodes = new RollupCheatCodes(cheatcodes, { rollupAddress });
  }

  async start() {
    const { epochDuration } = await this.rollupCheatCodes.getConfig();
    this.epochMonitor = new EpochMonitor(this.l2BlockSource, { epochDuration: Number(epochDuration) }, this.options);
    this.epochMonitor.start(this);
  }

  async stop() {
    await this.epochMonitor?.stop();
  }

  async handleEpochReadyToProve(epoch: EpochNumber): Promise<boolean> {
    const lastCheckpoint = await settleEpochOutbox({
      rollupCheatCodes: this.rollupCheatCodes,
      l2BlockSource: this.l2BlockSource,
      epoch,
      log: this.log,
    });
    if (lastCheckpoint !== undefined) {
      await this.rollupCheatCodes.markAsProven(lastCheckpoint);
    } else {
      this.log.warn(`No checkpoint found for epoch ${epoch}`);
    }

    return true;
  }
}
