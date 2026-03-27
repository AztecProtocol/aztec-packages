import type { L1FeeData, RollupContract } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { FEE_ORACLE_LAG, GasFees, ManaUsageEstimate, computeExcessMana, computeManaMinFee } from '@aztec/stdlib/gas';

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
 * Predicts min fees for the current slot and next LAG slots based on the L1 oracle state.
 * The prediction window is LAG slots because a new oracle update can activate after LAG slots,
 * making predictions beyond that unreliable.
 * Caches L1 queries per L1 block and recomputes predictions for each mana usage estimate.
 */
export class FeePredictor {
  private cachedState: Promise<FeeOracleState> | undefined;
  private cachedL1BlockNumber: bigint | undefined;

  constructor(
    private readonly rollupContract: RollupContract,
    private readonly slotDuration: number,
    private readonly l1GenesisTime: bigint,
  ) {}

  /** Returns predicted min fees for each slot in the prediction window. */
  async getPredictedMinFees(
    publicClient: { getBlockNumber: () => Promise<bigint> },
    manaUsage: ManaUsageEstimate,
  ): Promise<GasFees[]> {
    const state = await this.getState(publicClient);
    return this.computePredictions(state, manaUsage);
  }

  /** Fetches and caches rollup state. Refreshes when L1 block number advances. */
  private async getState(publicClient: { getBlockNumber: () => Promise<bigint> }): Promise<FeeOracleState> {
    const blockNumber = await publicClient.getBlockNumber();
    if (this.cachedL1BlockNumber === undefined || blockNumber > this.cachedL1BlockNumber) {
      this.cachedL1BlockNumber = blockNumber;
      this.cachedState = this.fetchState();
    }
    return this.cachedState!;
  }

  private async fetchState(): Promise<FeeOracleState> {
    // Most of the items below are cached by the rollup contract
    const [lastCheckpoint, currentSlot, manaTarget, manaLimit, provingCostPerManaEth, epochDuration] =
      await Promise.all([
        this.rollupContract.getPendingCheckpoint(),
        this.rollupContract.getSlotNumber(),
        this.rollupContract.getManaTarget(),
        this.rollupContract.getManaLimit(),
        this.rollupContract.getProvingCostPerMana(),
        this.rollupContract.getEpochDuration(),
      ]);

    const lastSlot = lastCheckpoint.slotNumber;
    // Start from the later of: the slot after the last checkpoint, or the current slot.
    const nextSlot = SlotNumber.add(lastSlot, 1) > currentSlot ? SlotNumber.add(lastSlot, 1) : currentSlot;
    const feeHeader = lastCheckpoint.feeHeader;

    const slotConfig = { slotDuration: this.slotDuration, l1GenesisTime: this.l1GenesisTime };
    const slotCount = FEE_ORACLE_LAG + 1;
    const timestamps = times(slotCount, i => getTimestampForSlot(SlotNumber.add(nextSlot, i), slotConfig));
    const l1FeesBySlot = await Promise.all(timestamps.map(ts => this.rollupContract.getL1FeesAt(ts)));

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

    // Slot 0: current state (next available slot after last checkpoint)
    result.push(this.computeGasFees(state, excessMana, state.l1FeesBySlot[0]));

    // Slots 1..LAG: advance excessMana with the assumed mana usage per checkpoint
    for (let i = 1; i < state.l1FeesBySlot.length; i++) {
      excessMana = computeExcessMana(excessMana, assumedManaUsed, state.manaTarget);
      result.push(this.computeGasFees(state, excessMana, state.l1FeesBySlot[i]));
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

  private computeGasFees(state: FeeOracleState, excessMana: bigint, l1Fees: L1FeeData): GasFees {
    return new GasFees(
      0,
      computeManaMinFee({
        l1BaseFee: l1Fees.baseFee,
        l1BlobFee: l1Fees.blobFee,
        manaTarget: state.manaTarget,
        epochDuration: state.epochDuration,
        provingCostPerManaEth: state.provingCostPerManaEth,
        excessMana,
        ethPerFeeAsset: state.ethPerFeeAsset,
      }),
    );
  }
}
