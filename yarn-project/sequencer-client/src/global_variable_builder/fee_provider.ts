import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import type { DateProvider } from '@aztec/foundation/timer';
import { getNextL1SlotTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { FeeProvider } from '@aztec/stdlib/tx';

import { FeePredictor } from './fee_predictor.js';
import type { GlobalVariableBuilderConfig } from './global_builder.js';

/** Provides current and predicted fee information based on on-chain state. */
export class FeeProviderImpl implements FeeProvider {
  private currentMinFees: Promise<GasFees> = Promise.resolve(new GasFees(0, 0));
  private currentL1BlockNumber: bigint | undefined = undefined;

  private readonly rollupContract: RollupContract;
  private readonly feePredictor: FeePredictor;
  private readonly slotDuration: number;
  private readonly ethereumSlotDuration: number;
  private readonly l1GenesisTime: bigint;

  constructor(
    private readonly dateProvider: DateProvider,
    private readonly publicClient: ViemPublicClient,
    config: GlobalVariableBuilderConfig,
  ) {
    this.slotDuration = config.slotDuration;
    this.ethereumSlotDuration = config.ethereumSlotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.rollupContract = new RollupContract(this.publicClient, config.rollupAddress);
    this.feePredictor = new FeePredictor(this.rollupContract, this.publicClient, this.dateProvider, {
      slotDuration: config.slotDuration,
      l1GenesisTime: config.l1GenesisTime,
      ethereumSlotDuration: config.ethereumSlotDuration,
    });
  }

  /**
   * Computes the "current" min fees, e.g., the price that you currently should pay to get include in the next block
   * @returns Min fees for the next block
   */
  private async computeCurrentMinFees(): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.

    const lastCheckpoint = await this.rollupContract.getPendingCheckpoint();
    const earliestTimestamp = getTimestampForSlot(SlotNumber.fromBigInt(BigInt(lastCheckpoint.slotNumber) + 1n), {
      slotDuration: this.slotDuration,
      l1GenesisTime: this.l1GenesisTime,
    });
    const nextEthTimestamp = getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), {
      l1GenesisTime: this.l1GenesisTime,
      ethereumSlotDuration: this.ethereumSlotDuration,
    });
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(0, await this.rollupContract.getManaMinFeeAt(timestamp, true));
  }

  public async getCurrentMinFees(): Promise<GasFees> {
    // Get the current block number
    const blockNumber = await this.publicClient.getBlockNumber({ cacheTime: 0 });

    // If the L1 block number has changed then chain a new promise to get the current min fees
    if (this.currentL1BlockNumber === undefined || blockNumber > this.currentL1BlockNumber) {
      this.currentL1BlockNumber = blockNumber;
      this.currentMinFees = this.currentMinFees
        .catch(() => undefined)
        .then(() => this.computeCurrentMinFees())
        .catch(err => {
          if (this.currentL1BlockNumber === blockNumber) {
            this.currentL1BlockNumber = undefined;
          }
          throw err;
        });
    }
    return this.currentMinFees;
  }

  public async getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]> {
    const [currentMinFees, predictedMinFees] = await Promise.all([
      this.getCurrentMinFees(),
      this.feePredictor.getPredictedMinFees(manaUsage ?? ManaUsageEstimate.Target),
    ]);

    return [currentMinFees, ...predictedMinFees];
  }
}
