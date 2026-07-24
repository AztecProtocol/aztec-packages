import type { RollupContract } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import {
  type L1RollupConstants,
  getNextL1SlotTimestamp,
  getSlotAtNextL1Block,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import { FEE_ORACLE_LAG, GasFees, type ManaUsageEstimate, computeExcessMana } from '@aztec/stdlib/gas';

import { type FeeOracleState, computePredictions } from './fee_prediction.js';

type LegacyOracleConstants = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

/**
 * Faithful refactor of the legacy `FeeProviderImpl.computeCurrentMinFees`, taking `(blockNumber, now)` explicitly
 * and pinned to that block. Retained only as the equivalence oracle for the snapshot service in tests; the
 * production current-fee path is served from the snapshot.
 */
export async function computeLegacyCurrentMinFees(
  rollup: RollupContract,
  blockNumber: bigint,
  nowSeconds: number,
  constants: LegacyOracleConstants,
): Promise<GasFees> {
  const pendingCheckpointNumber = await rollup.getCheckpointNumber({ blockNumber });
  const lastCheckpoint = await rollup.getCheckpoint(pendingCheckpointNumber, { blockNumber });
  const earliestTimestamp = getTimestampForSlot(SlotNumber.add(lastCheckpoint.slotNumber, 1), constants);
  const nextEthTimestamp = getNextL1SlotTimestamp(nowSeconds, constants);
  const timestamp = earliestTimestamp > nextEthTimestamp ? earliestTimestamp : nextEthTimestamp;
  return new GasFees(0, await rollup.getManaMinFeeAt(timestamp, true, { blockNumber }));
}

/**
 * Faithful refactor of the legacy `FeePredictor.fetchState`, taking `(blockNumber, now)` explicitly and pinned to
 * that block. Retained only as the equivalence oracle for the snapshot service in tests.
 */
export async function fetchLegacyFeeOracleState(
  rollup: RollupContract,
  blockNumber: bigint,
  nowSeconds: number,
  constants: LegacyOracleConstants,
): Promise<FeeOracleState> {
  const opts = { blockNumber };
  const [manaTarget, manaLimit, provingCostPerManaEth, epochDuration] = await Promise.all([
    rollup.readManaTarget(opts),
    rollup.readManaLimit(opts),
    rollup.readProvingCostPerManaInEth(opts),
    rollup.getEpochDuration(),
  ]);

  const currentSlot = await rollup.getSlotNumber(opts);
  const slotAtNextL1Block = getSlotAtNextL1Block(BigInt(nowSeconds), constants);
  const preliminaryNextSlot = SlotNumber(Math.max(currentSlot, slotAtNextL1Block));
  const nextSlotTimestamp = getTimestampForSlot(preliminaryNextSlot, constants);

  const lastCheckpoint = await rollup.getEffectivePendingCheckpoint(nextSlotTimestamp, opts);
  const lastSlot = lastCheckpoint.slotNumber;
  const nextSlot = SlotNumber(Math.max(SlotNumber.add(lastSlot, 1), preliminaryNextSlot));
  const feeHeader = lastCheckpoint.feeHeader;

  const timestamps = times(FEE_ORACLE_LAG, i => getTimestampForSlot(SlotNumber.add(nextSlot, i), constants));
  const l1FeesBySlot = await Promise.all(timestamps.map(ts => rollup.getL1FeesAt(ts, opts)));

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

/** Legacy `getPredictedMinFees`: current fee followed by the prediction window, on identical explicit inputs. */
export async function computeLegacyPredictedMinFees(
  rollup: RollupContract,
  blockNumber: bigint,
  nowSeconds: number,
  constants: LegacyOracleConstants,
  manaUsage: ManaUsageEstimate,
): Promise<GasFees[]> {
  const [current, state] = await Promise.all([
    computeLegacyCurrentMinFees(rollup, blockNumber, nowSeconds, constants),
    fetchLegacyFeeOracleState(rollup, blockNumber, nowSeconds, constants),
  ]);
  return [current, ...computePredictions(state, manaUsage)];
}
