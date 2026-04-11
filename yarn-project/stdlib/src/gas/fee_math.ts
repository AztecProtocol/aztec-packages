/**
 * TypeScript port of fee computation logic from FeeLib.sol.
 * Used to predict worst-case min fees over a future window of L2 slots.
 */

// Constants matching FeeLib.sol
export const MINIMUM_CONGESTION_MULTIPLIER = 1_000_000_000n;
export const L1_GAS_PER_CHECKPOINT_PROPOSED = 300_000n;
export const L1_GAS_PER_EPOCH_VERIFIED = 3_600_000n;
export const BLOBS_PER_CHECKPOINT = 3n;
export const BLOB_GAS_PER_BLOB = 2n ** 17n;
export const MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854n;
export const MAGIC_CONGESTION_VALUE_DIVISOR = 100_000_000n;
export const ETH_PER_FEE_ASSET_PRECISION = 1_000_000_000_000n;
export const MIN_ETH_PER_FEE_ASSET = 100n;

/** Number of L2 slots of lag before new oracle values activate. Defines the prediction window. */
export const FEE_ORACLE_LAG = 2;

/** Expected mana usage per checkpoint for fee prediction. */
export enum ManaUsageEstimate {
  /** No usage — fees decrease as congestion drains. */
  None = 'none',
  /** Target usage — congestion stays roughly flat (steady state). */
  Target = 'target',
  /** Limit usage (2x target) — worst case, congestion grows maximally. */
  Limit = 'limit',
}

/** Parameters for computing the mana min fee at a given point in time. */
export type ManaMinFeeParams = {
  l1BaseFee: bigint;
  l1BlobFee: bigint;
  manaTarget: bigint;
  epochDuration: bigint;
  provingCostPerManaEth: bigint;
  excessMana: bigint;
  ethPerFeeAsset: bigint;
};

/**
 * Taylor series approximation of `factor * e^(numerator/denominator)`.
 * Direct port of FeeLib.sol fakeExponential (EIP-4844 style).
 */
export function fakeExponential(factor: bigint, numerator: bigint, denominator: bigint): bigint {
  let i = 1n;
  let output = 0n;
  let numeratorAccumulator = factor * denominator;
  while (numeratorAccumulator > 0n) {
    output += numeratorAccumulator;
    numeratorAccumulator = (numeratorAccumulator * numerator) / (denominator * i);
    i += 1n;
  }
  return output / denominator;
}

/** Computes excess mana for the next checkpoint, clamped to zero. */
export function computeExcessMana(prevExcessMana: bigint, prevManaUsed: bigint, manaTarget: bigint): bigint {
  const sum = prevExcessMana + prevManaUsed;
  return sum > manaTarget ? sum - manaTarget : 0n;
}

/** Computes the congestion multiplier from excess mana (1e9 = no congestion). */
export function computeCongestionMultiplier(excessMana: bigint, manaTarget: bigint): bigint {
  const denominator = (manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER) / MAGIC_CONGESTION_VALUE_DIVISOR;
  const cappedNumerator = excessMana < denominator * 100n ? excessMana : denominator * 100n;
  return fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, cappedNumerator, denominator);
}

/** Ceiling division for positive bigints. */
function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** Converts an ETH value to fee asset value using ethPerFeeAsset (1e12 precision). */
function toFeeAsset(ethValue: bigint, ethPerFeeAsset: bigint): bigint {
  if (ethPerFeeAsset === 0n) {
    return 0n;
  }
  return ceilDiv(ethValue * ETH_PER_FEE_ASSET_PRECISION, ethPerFeeAsset);
}

/**
 * Computes the full mana min fee (sequencer + prover + congestion) in fee asset terms.
 * Mirrors FeeLib.getManaMinFeeComponentsAt + summedMinFee.
 */
export function computeManaMinFee(params: ManaMinFeeParams): bigint {
  const { l1BaseFee, l1BlobFee, manaTarget, epochDuration, provingCostPerManaEth, excessMana, ethPerFeeAsset } = params;

  if (manaTarget === 0n) {
    return 0n;
  }

  // Sequencer cost per mana (in ETH)
  const ethUsed = L1_GAS_PER_CHECKPOINT_PROPOSED * l1BaseFee + BLOBS_PER_CHECKPOINT * BLOB_GAS_PER_BLOB * l1BlobFee;
  const sequencerCostEth = ceilDiv(ethUsed, manaTarget);

  // Prover cost per mana (in ETH): L1 verification gas + governance-set proving cost
  const proverCostEth =
    ceilDiv(ceilDiv(L1_GAS_PER_EPOCH_VERIFIED * l1BaseFee, epochDuration), manaTarget) + provingCostPerManaEth;

  // Total base cost in ETH (congestion is computed on this)
  const totalEth = sequencerCostEth + proverCostEth;

  // Congestion multiplier and cost (in ETH)
  const congestionMul = computeCongestionMultiplier(excessMana, manaTarget);
  const congestionCostEth = (totalEth * congestionMul) / MINIMUM_CONGESTION_MULTIPLIER - totalEth;

  // Convert all components to fee asset
  const clampedEthPerFeeAsset = ethPerFeeAsset < MIN_ETH_PER_FEE_ASSET ? MIN_ETH_PER_FEE_ASSET : ethPerFeeAsset;
  const sequencerCost = toFeeAsset(sequencerCostEth, clampedEthPerFeeAsset);
  const proverCost = toFeeAsset(proverCostEth, clampedEthPerFeeAsset);
  const congestionCost = toFeeAsset(congestionCostEth, clampedEthPerFeeAsset);

  const total = sequencerCost + proverCost + congestionCost;

  // Cap at uint128 max (matching FeeLib.summedMinFee)
  const UINT128_MAX = (1n << 128n) - 1n;
  return total < UINT128_MAX ? total : UINT128_MAX;
}
