import { type L1FeeData, MAX_FEE_ASSET_PRICE_MODIFIER_BPS, type RollupContract } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import type { DateProvider } from '@aztec/foundation/timer';
import { getSlotAtNextL1Block, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import {
  FEE_ORACLE_LAG,
  GasFees,
  MIN_ETH_PER_FEE_ASSET,
  ManaUsageEstimate,
  computeExcessMana,
  computeManaMinFee,
} from '@aztec/stdlib/gas';

/** Cached rollup state for fee prediction. Refreshed once per L1 block. */
type FeeOracleState = {
  lastSlot: SlotNumber;
  excessMana: bigint;
  ethPerFeeAsset: bigint;
  manaTarget: bigint;
  manaLimit: bigint;
  provingCostPerManaEth: bigint;
  epochDuration: bigint;
  /** Pre-resolved L1 fees for each slot in the prediction window. */
  l1FeesBySlot: L1FeeData[];
};

/**
 * Predicts min fees for LAG upcoming slots based on the L1 oracle state.
 * A new oracle update can activate at startSlot + LAG, so only the first LAG entries
 * are guaranteed stable.
 */
export class FeePredictor {
  private cachedState: FeeOracleState | undefined;

  private readonly slotDuration: number;
  private readonly l1GenesisTime: bigint;
  private readonly ethereumSlotDuration: number;

  constructor(
    private readonly rollupContract: RollupContract,
    private readonly dateProvider: DateProvider,
    config: { slotDuration: number; l1GenesisTime: bigint; ethereumSlotDuration: number },
  ) {
    this.slotDuration = config.slotDuration;
    this.l1GenesisTime = config.l1GenesisTime;
    this.ethereumSlotDuration = config.ethereumSlotDuration;
  }

  /** Returns predicted min fees for each slot in the prediction window, from the cached state. */
  getPredictedMinFees(manaUsage: ManaUsageEstimate): GasFees[] {
    const state = this.getState();
    if (state === undefined) {
      throw new Error('FeePredictor.refreshState() must be called before getPredictedMinFees()');
    }
    return this.computePredictions(state, manaUsage);
  }

  /** Returns whatever rollup state is currently cached, or undefined if refreshState() has never been called. */
  getState(): FeeOracleState | undefined {
    return this.cachedState;
  }

  /**
   * Fetches and caches rollup state for the given L1 block.
   */
  async refreshState(blockNumber: bigint): Promise<FeeOracleState> {
    const state = await this.fetchState(blockNumber);
    this.cachedState = state;
    return state;
  }

  private async fetchState(blockNumber: bigint): Promise<FeeOracleState> {
    // Pin all non-constant queries to this L1 block number for a consistent snapshot.
    const opts = { blockNumber };

    // Cached constants don't need pinning
    const [manaTarget, manaLimit, provingCostPerManaEth, epochDuration] = await Promise.all([
      this.rollupContract.getManaTarget(),
      this.rollupContract.getManaLimit(),
      this.rollupContract.getProvingCostPerMana(),
      this.rollupContract.getEpochDuration(),
    ]);

    // First, compute the earliest possible nextSlot independently of the checkpoint, so we can
    // evaluate pruneability at the prediction start timestamp instead of the current L1 block time.
    // This avoids an epoch-boundary edge case where the effective parent differs between now and nextSlot.
    const slotConfig = { slotDuration: this.slotDuration, l1GenesisTime: this.l1GenesisTime };
    const currentSlot = await this.rollupContract.getSlotNumber(opts);

    const slotAtNextL1Block = getSlotAtNextL1Block(BigInt(this.dateProvider.nowInSeconds()), {
      l1GenesisTime: this.l1GenesisTime,
      slotDuration: this.slotDuration,
      ethereumSlotDuration: this.ethereumSlotDuration,
    });
    const preliminaryNextSlot = SlotNumber(Math.max(currentSlot, slotAtNextL1Block));
    const nextSlotTimestamp = getTimestampForSlot(preliminaryNextSlot, slotConfig);

    // Resolve the effective checkpoint at the prediction start timestamp
    const lastCheckpoint = await this.rollupContract.getEffectivePendingCheckpoint(nextSlotTimestamp, opts);
    const lastSlot = lastCheckpoint.slotNumber;
    // Refine nextSlot: also account for the slot after the last checkpoint
    const nextSlot = SlotNumber(Math.max(SlotNumber.add(lastSlot, 1), preliminaryNextSlot));
    const feeHeader = lastCheckpoint.feeHeader;

    const slotCount = FEE_ORACLE_LAG;
    const timestamps = times(slotCount, i => getTimestampForSlot(SlotNumber.add(nextSlot, i), slotConfig));
    const l1FeesBySlot = await Promise.all(timestamps.map(ts => this.rollupContract.getL1FeesAt(ts, opts)));

    return {
      lastSlot,
      excessMana: computeExcessMana(feeHeader.excessMana, feeHeader.manaUsed, manaTarget),
      ethPerFeeAsset: feeHeader.ethPerFeeAsset,
      manaTarget,
      manaLimit,
      provingCostPerManaEth,
      epochDuration: BigInt(epochDuration),
      l1FeesBySlot,
    };
  }

  /** Computes per-slot fee predictions given cached state and a mana usage assumption. */
  private computePredictions(state: FeeOracleState, manaUsage: ManaUsageEstimate): GasFees[] {
    const assumedManaUsed = this.getAssumedManaUsed(state, manaUsage);

    const result: GasFees[] = [];
    let { excessMana } = state;
    let { ethPerFeeAsset } = state;

    // Slot 0: current state (next available slot after last checkpoint)
    result.push(this.computeGasFees(state, excessMana, ethPerFeeAsset, state.l1FeesBySlot[0]));

    // Slots 1..LAG-1: advance excessMana with the assumed mana usage per checkpoint,
    // and decay ethPerFeeAsset by MAX_FEE_ASSET_PRICE_MODIFIER_BPS per slot for conservative estimates.
    // Lower ethPerFeeAsset means higher fees in fee asset terms.
    for (let i = 1; i < state.l1FeesBySlot.length; i++) {
      excessMana = computeExcessMana(excessMana, assumedManaUsed, state.manaTarget);
      const decayed = (ethPerFeeAsset * (10000n - MAX_FEE_ASSET_PRICE_MODIFIER_BPS)) / 10000n;
      ethPerFeeAsset = decayed < MIN_ETH_PER_FEE_ASSET ? MIN_ETH_PER_FEE_ASSET : decayed;
      result.push(this.computeGasFees(state, excessMana, ethPerFeeAsset, state.l1FeesBySlot[i]));
    }

    return result;
  }

  private getAssumedManaUsed(state: FeeOracleState, manaUsage: ManaUsageEstimate): bigint {
    switch (manaUsage) {
      case ManaUsageEstimate.None:
        return 0n;
      case ManaUsageEstimate.Target:
        return state.manaTarget;
      case ManaUsageEstimate.Limit:
        return state.manaLimit;
    }
  }

  private computeGasFees(
    state: FeeOracleState,
    excessMana: bigint,
    ethPerFeeAsset: bigint,
    l1Fees: L1FeeData,
  ): GasFees {
    return new GasFees(
      0,
      computeManaMinFee({
        l1BaseFee: l1Fees.baseFee,
        l1BlobFee: l1Fees.blobFee,
        manaTarget: state.manaTarget,
        epochDuration: state.epochDuration,
        provingCostPerManaEth: state.provingCostPerManaEth,
        excessMana,
        ethPerFeeAsset,
      }),
    );
  }
}
