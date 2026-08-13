import { type L1FeeData, MAX_FEE_ASSET_PRICE_MODIFIER_BPS } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import {
  FEE_ORACLE_LAG,
  GasFees,
  MIN_ETH_PER_FEE_ASSET,
  ManaUsageEstimate,
  computeExcessMana,
  computeManaMinFee,
} from '@aztec/stdlib/gas';

/**
 * Resolved rollup state for a single prediction anchor slot. Every field is a finished input to the pure
 * fee math below; nothing here reads L1. Callers build this from pinned reads and then feed it to
 * {@link computePredictions}.
 */
export type FeeOracleState = {
  /** Excess mana carried into the anchor slot. */
  excessMana: bigint;
  /** Fee-asset price (eth per fee asset) at the anchor. */
  ethPerFeeAsset: bigint;
  manaTarget: bigint;
  manaLimit: bigint;
  provingCostPerManaEth: bigint;
  epochDuration: bigint;
  /** Pre-resolved L1 fees for each slot in the prediction window `[nextSlot, nextSlot + FEE_ORACLE_LAG)`. */
  l1FeesBySlot: L1FeeData[];
};

/**
 * The slots a prediction anchored at `anchorSlot` needs L1 fee oracle values for. The window starts at the slot
 * after the effective parent, but never before the anchor slot.
 */
export function getPredictionWindowSlots(anchorSlot: SlotNumber, effectiveParentSlot: SlotNumber): SlotNumber[] {
  const nextSlot = SlotNumber(Math.max(SlotNumber.add(effectiveParentSlot, 1), anchorSlot));
  return times(FEE_ORACLE_LAG, i => SlotNumber.add(nextSlot, i));
}

/**
 * Computes per-slot fee predictions for a given mana-usage assumption. The first entry uses the resolved
 * current state; subsequent entries advance excess mana by the assumed usage and decay the fee-asset price
 * by `MAX_FEE_ASSET_PRICE_MODIFIER_BPS` per slot for a conservative (upper-bound) estimate.
 */
export function computePredictions(state: FeeOracleState, manaUsage: ManaUsageEstimate): GasFees[] {
  const assumedManaUsed = getAssumedManaUsed(state, manaUsage);

  const result: GasFees[] = [];
  let { excessMana } = state;
  let { ethPerFeeAsset } = state;

  result.push(computeGasFees(state, excessMana, ethPerFeeAsset, state.l1FeesBySlot[0]));

  for (let i = 1; i < state.l1FeesBySlot.length; i++) {
    excessMana = computeExcessMana(excessMana, assumedManaUsed, state.manaTarget);
    const decayed = (ethPerFeeAsset * (10000n - MAX_FEE_ASSET_PRICE_MODIFIER_BPS)) / 10000n;
    ethPerFeeAsset = decayed < MIN_ETH_PER_FEE_ASSET ? MIN_ETH_PER_FEE_ASSET : decayed;
    result.push(computeGasFees(state, excessMana, ethPerFeeAsset, state.l1FeesBySlot[i]));
  }

  return result;
}

function getAssumedManaUsed(state: FeeOracleState, manaUsage: ManaUsageEstimate): bigint {
  switch (manaUsage) {
    case ManaUsageEstimate.None:
      return 0n;
    case ManaUsageEstimate.Target:
      return state.manaTarget;
    case ManaUsageEstimate.Limit:
      return state.manaLimit;
  }
}

function computeGasFees(state: FeeOracleState, excessMana: bigint, ethPerFeeAsset: bigint, l1Fees: L1FeeData): GasFees {
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
