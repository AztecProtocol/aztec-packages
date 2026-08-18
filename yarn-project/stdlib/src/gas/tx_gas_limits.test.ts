import { NUM_CHECKPOINT_END_MARKER_FIELDS, getNumBlockEndBlobFields } from '@aztec/blob-lib/encoding';
import {
  BLOBS_PER_CHECKPOINT,
  CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
  DA_GAS_PER_FIELD,
  FIELDS_PER_BLOB,
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';

import { buildProposerTimetable } from '../timetable/build_proposer_timetable.js';
import {
  MIN_PER_BLOCK_ALLOCATION_MULTIPLIER,
  MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER,
  computeNetworkTxGasLimits,
  getDaCheckpointBudgetForTxs,
  getNetworkTxGasLimits,
} from './tx_gas_limits.js';

const MANA_CHECKPOINT_BUDGET = 10_000_000;

describe('computeNetworkTxGasLimits', () => {
  it('caps DA gas at the per-block allocation when it is below the per-tx blob ceiling', () => {
    const gas = computeNetworkTxGasLimits({ maxBlocksPerCheckpoint: 10, manaCheckpointBudget: MANA_CHECKPOINT_BUDGET });
    expect(gas.daGas).toBe(Math.ceil((getDaCheckpointBudgetForTxs(10) / 10) * MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER));
    expect(gas.daGas).toBeLessThan(MAX_TX_DA_GAS);
  });

  it('admitted tx always fits the first-block blob-field cap across all valid geometries', () => {
    // Guards against the mismatch where the admission DA limit uses the raw checkpoint capacity but the
    // builder's blob-field cap uses the overhead-adjusted capacity, causing txs to be admitted but never
    // buildable at certain blocks-per-checkpoint geometries.
    for (let b = 1; b <= 24; b++) {
      const admittedBlobFields = Math.floor(
        computeNetworkTxGasLimits({ maxBlocksPerCheckpoint: b, manaCheckpointBudget: MANA_CHECKPOINT_BUDGET }).daGas /
          DA_GAS_PER_FIELD,
      );
      const firstBlockBlobFieldCap = Math.ceil(
        ((BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB - NUM_CHECKPOINT_END_MARKER_FIELDS - getNumBlockEndBlobFields()) / b) *
          MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER,
      );
      expect(admittedBlobFields).toBeLessThanOrEqual(firstBlockBlobFieldCap);
    }
  });

  it('caps DA gas at the per-tx blob ceiling in single-block mode', () => {
    // With a single block the even share is the full checkpoint budget, which exceeds what one tx can post.
    const gas = computeNetworkTxGasLimits({ maxBlocksPerCheckpoint: 1, manaCheckpointBudget: MANA_CHECKPOINT_BUDGET });
    expect(gas.daGas).toBe(MAX_TX_DA_GAS);
  });

  it('caps L2 gas at the per-block mana allocation when a budget is given', () => {
    const manaCheckpointBudget = 10_000_000;
    const gas = computeNetworkTxGasLimits({ maxBlocksPerCheckpoint: 10, manaCheckpointBudget });
    expect(gas.l2Gas).toBe(
      Math.min(MAX_PROCESSABLE_L2_GAS, Math.ceil((manaCheckpointBudget / 10) * MIN_PER_BLOCK_ALLOCATION_MULTIPLIER)),
    );
  });

  it('clamps L2 gas by the checkpoint mana budget at blocks=1 (multiplier would overshoot)', () => {
    // At a single block the per-block share is the whole budget, and the >1 multiplier would push the limit
    // above the budget itself — admitting a tx no builder can ever pack (the builder caps L2 by remainingMana).
    // The budget clamp keeps the advertised L2 limit at or below the budget.
    const manaCheckpointBudget = 1_000_000;
    const gas = computeNetworkTxGasLimits({ maxBlocksPerCheckpoint: 1, manaCheckpointBudget });
    expect(gas.l2Gas).toBeLessThanOrEqual(manaCheckpointBudget);
  });
});

describe('getDaCheckpointBudgetForTxs', () => {
  it('clamps to zero for absurd geometries instead of going negative', () => {
    expect(getDaCheckpointBudgetForTxs(10_000)).toBe(0);
    expect(
      computeNetworkTxGasLimits({ maxBlocksPerCheckpoint: 10_000, manaCheckpointBudget: MANA_CHECKPOINT_BUDGET }).daGas,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('getNetworkTxGasLimits', () => {
  const l1Constants = {
    l1GenesisTime: 0n,
    slotDuration: 72,
    ethereumSlotDuration: 12,
    rollupManaLimit: 10_000_000,
  };

  it('derives the limit from config + L1 constants using the network-minimum multipliers', () => {
    const gas = getNetworkTxGasLimits({ blockDurationMs: 6000 }, l1Constants);
    const maxBlocksPerCheckpoint = buildProposerTimetable(
      { blockDurationMs: 6000 },
      l1Constants,
    ).getMaxBlocksPerCheckpoint();
    const expected = computeNetworkTxGasLimits({
      maxBlocksPerCheckpoint,
      manaCheckpointBudget: l1Constants.rollupManaLimit,
    });
    expect(gas.daGas).toBe(expected.daGas);
    expect(gas.l2Gas).toBe(expected.l2Gas);
  });
});

describe('v5 mainnet geometry (72s slots / 6s blocks → 10 blocks per checkpoint)', () => {
  // Largest tx we want to support: a maximal contract class registration, dominated by its contract class
  // log (content + contract-address field) plus the fixed tx overhead. Deploy-side nullifiers add a handful
  // more fields, so this is a lower bound on the true largest deploy.
  const largestDeployDaGas = (CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1) * DA_GAS_PER_FIELD + TX_DA_GAS_OVERHEAD;
  const maxBlocksPerCheckpoint = 10;

  it('the timetable derives 10 blocks per checkpoint', () => {
    const blocks = buildProposerTimetable(
      { blockDurationMs: 6000 },
      { l1GenesisTime: 0n, slotDuration: 72, ethereumSlotDuration: 12 },
    ).getMaxBlocksPerCheckpoint();
    expect(blocks).toBe(maxBlocksPerCheckpoint);
  });

  it('fits the largest contract class deploy with the DA multiplier, but not with the general multiplier', () => {
    // Green: the 1.5 DA multiplier (used by computeNetworkTxGasLimits) leaves room for the largest deploy.
    expect(
      computeNetworkTxGasLimits({ maxBlocksPerCheckpoint, manaCheckpointBudget: MANA_CHECKPOINT_BUDGET }).daGas,
    ).toBeGreaterThanOrEqual(largestDeployDaGas);

    // Red: the general 1.2 multiplier would not — the higher DA-specific minimum is what fits the deploy.
    const daBudget = getDaCheckpointBudgetForTxs(maxBlocksPerCheckpoint);
    const generalMultiplierDaGas = Math.ceil((daBudget / maxBlocksPerCheckpoint) * MIN_PER_BLOCK_ALLOCATION_MULTIPLIER);
    expect(generalMultiplierDaGas).toBeLessThan(largestDeployDaGas);
  });
});
