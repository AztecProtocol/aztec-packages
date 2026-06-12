import type { RollupFeeReader } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import type { DateProvider } from '@aztec/foundation/timer';
import { getNextL1SlotTimestamp } from '@aztec/stdlib/epoch-helpers';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { FeeProvider } from '@aztec/stdlib/tx';

import { FeePredictor } from './fee_predictor.js';
import type { GlobalVariableBuilderConfig } from './global_builder.js';

/**
 * Provides current and predicted fee information based on on-chain state.
 *
 * All L1 reads go through the shared {@link RollupFeeReader}, which caches each result per L1 block.
 * There is no caching here: a repeated call within the same L1 block is served from the reader's
 * caches, and a new L1 block produces new keys there. This keeps every fee-related L1 read in the
 * process behind a single caching layer.
 */
export class FeeProviderImpl implements FeeProvider {
  private readonly feePredictor: FeePredictor;
  private readonly ethereumSlotDuration: number;
  private readonly l1GenesisTime: bigint;

  constructor(
    private readonly dateProvider: DateProvider,
    private readonly feeReader: RollupFeeReader,
    config: GlobalVariableBuilderConfig,
  ) {
    this.ethereumSlotDuration = config.ethereumSlotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.feePredictor = new FeePredictor(this.feeReader, this.dateProvider, {
      slotDuration: config.slotDuration,
      l1GenesisTime: config.l1GenesisTime,
      ethereumSlotDuration: config.ethereumSlotDuration,
    });
  }

  /**
   * Computes the "current" min fees, e.g., the price that you currently should pay to get included in the next block.
   * Resolves the L1 block once and threads it so the pending-checkpoint and min-fee reads share one snapshot.
   * @returns Min fees for the next block
   */
  private async computeCurrentMinFees(): Promise<GasFees> {
    // Since this might be called in the middle of a slot where a block might have been published,
    // we need to fetch the last block written, and estimate the earliest timestamp for the next block.
    // The timestamp of that last block will act as a lower bound for the next block.

    const blockNumber = await this.feeReader.getL1BlockNumber();
    const lastCheckpoint = await this.feeReader.getPendingCheckpoint({ blockNumber });
    const earliestTimestamp = await this.feeReader.getTimestampForSlot(
      SlotNumber.fromBigInt(BigInt(lastCheckpoint.slotNumber) + 1n),
    );
    const nextEthTimestamp = getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), {
      l1GenesisTime: this.l1GenesisTime,
      ethereumSlotDuration: this.ethereumSlotDuration,
    });
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(0, await this.feeReader.getManaMinFeeAt(timestamp, true, { l1BlockNumber: blockNumber }));
  }

  public getCurrentMinFees(): Promise<GasFees> {
    return this.computeCurrentMinFees();
  }

  public async getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]> {
    const [currentMinFees, predictedMinFees] = await Promise.all([
      this.getCurrentMinFees(),
      this.feePredictor.getPredictedMinFees(manaUsage ?? ManaUsageEstimate.Target),
    ]);

    return [currentMinFees, ...predictedMinFees];
  }
}
