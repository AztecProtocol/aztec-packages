import { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { DateProvider } from '@aztec/foundation/timer';
import { getNextL1SlotTimestamp } from '@aztec/stdlib/epoch-helpers';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';
import type { FeeProvider } from '@aztec/stdlib/tx';

import { FeePredictor } from './fee_predictor.js';
import type { GlobalVariableBuilderConfig } from './global_builder.js';

/** Default interval for the background L1 refresh loop, well below L1's block time. */
const DEFAULT_REFRESH_POLLING_INTERVAL_MS = 1000;

/**
 * Provides current and predicted fee information based on on-chain state.
 */
export class FeeProviderImpl implements FeeProvider {
  private currentMinFees = new GasFees(0, 0);
  private currentL1BlockNumber: bigint | undefined = undefined;
  private refreshLoop: RunningPromise | undefined;

  private readonly rollupContract: RollupContract;
  private readonly feePredictor: FeePredictor;
  private readonly ethereumSlotDuration: number;
  private readonly l1GenesisTime: bigint;
  private readonly log: Logger = createLogger('sequencer-client:fee-provider');

  constructor(
    private readonly dateProvider: DateProvider,
    private readonly publicClient: ViemPublicClient,
    config: GlobalVariableBuilderConfig,
  ) {
    this.ethereumSlotDuration = config.ethereumSlotDuration;
    this.l1GenesisTime = config.l1GenesisTime;

    this.rollupContract = new RollupContract(this.publicClient, config.rollupAddress);
    this.feePredictor = new FeePredictor(this.rollupContract, this.dateProvider, {
      slotDuration: config.slotDuration,
      l1GenesisTime: config.l1GenesisTime,
      ethereumSlotDuration: config.ethereumSlotDuration,
    });
  }

  public async start(pollingIntervalMs = DEFAULT_REFRESH_POLLING_INTERVAL_MS): Promise<void> {
    await this.refreshFromL1();
    this.refreshLoop = new RunningPromise(() => this.refreshFromL1(), this.log, pollingIntervalMs);
    this.refreshLoop.start();
  }

  public async stop(): Promise<void> {
    await this.refreshLoop?.stop();
  }

  /**
   * Checks the current L1 block number and, if it has advanced, refreshes both the current and
   * predicted min fees for that block.
   */
  private async refreshFromL1(): Promise<void> {
    const blockNumber = await this.publicClient.getBlockNumber({ cacheTime: 0 });
    if (this.currentL1BlockNumber !== undefined && blockNumber <= this.currentL1BlockNumber) {
      return;
    }

    const currentMinFees = await this.computeCurrentMinFees();
    await this.feePredictor.refreshState(blockNumber);
    this.currentMinFees = currentMinFees;
    this.currentL1BlockNumber = blockNumber;
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
    const earliestTimestamp = await this.rollupContract.getTimestampForSlot(
      SlotNumber.fromBigInt(BigInt(lastCheckpoint.slotNumber) + 1n),
    );
    const nextEthTimestamp = getNextL1SlotTimestamp(this.dateProvider.nowInSeconds(), {
      l1GenesisTime: this.l1GenesisTime,
      ethereumSlotDuration: this.ethereumSlotDuration,
    });
    const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;

    return new GasFees(0, await this.rollupContract.getManaMinFeeAt(timestamp, true));
  }

  public getCurrentMinFees(): Promise<GasFees> {
    return Promise.resolve(this.currentMinFees);
  }

  public getPredictedMinFees(manaUsage?: ManaUsageEstimate): Promise<GasFees[]> {
    const currentMinFees = this.currentMinFees;
    const predictedMinFees = this.feePredictor.getPredictedMinFees(manaUsage ?? ManaUsageEstimate.Target);
    return Promise.resolve([currentMinFees, ...predictedMinFees]);
  }
}
