import {
  NUM_BLOCK_END_BLOB_FIELDS,
  NUM_CHECKPOINT_END_MARKER_FIELDS,
  NUM_FIRST_BLOCK_END_BLOB_FIELDS,
} from '@aztec/blob-lib/encoding';
import {
  BLOBS_PER_CHECKPOINT,
  DA_GAS_PER_FIELD,
  FIELDS_PER_BLOB,
  MAX_PROCESSABLE_L2_GAS,
  MAX_TX_DA_GAS,
} from '@aztec/constants';

import { type ProposerTimetableConfig, buildProposerTimetable } from '../timetable/build_proposer_timetable.js';
import type { SlotTimingConstants } from '../timetable/consensus_timetable.js';
import { Gas } from './gas.js';

/**
 * Network-minimum per-block budget multiplier for L2 gas and tx-count allocation. A block packer must
 * grant at least this share of the even per-block split to a single tx; operators may configure a higher
 * multiplier (more generous), but not a lower one — enforced at sequencer startup. Also used as the default
 * for `SequencerConfig.perBlockAllocationMultiplier`.
 */
export const MIN_PER_BLOCK_ALLOCATION_MULTIPLIER = 1.2;

/**
 * Network-minimum per-block budget multiplier for DA gas, applied in place of the general
 * {@link MIN_PER_BLOCK_ALLOCATION_MULTIPLIER}. Higher than the general multiplier so the largest tx we
 * want to support — a maximal contract class registration (~97k DA gas) — fits a single block under v5
 * mainnet geometry (72s slots, 6s blocks → 10 blocks per checkpoint). A builder may configure a higher
 * multiplier but never a lower one. Also used as the default for
 * `SequencerConfig.perBlockDAAllocationMultiplier`.
 */
export const MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER = 1.5;

/**
 * The DA gas budget available to tx data within a checkpoint of `maxBlocksPerCheckpoint` blocks. This is the
 * raw blob capacity (`BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB * DA_GAS_PER_FIELD`) minus the fields the blob
 * encoding reserves for overhead that no tx pays DA gas for:
 *
 * - one checkpoint-end marker field (`NUM_CHECKPOINT_END_MARKER_FIELDS`),
 * - the first block's block-end fields (`NUM_FIRST_BLOCK_END_BLOB_FIELDS`, 7), and
 * - `NUM_BLOCK_END_BLOB_FIELDS` (6) for each of the `blocks - 1` subsequent blocks.
 *
 * Subtracting the overhead for every block (not just the first) keeps the network DA admission limit at or
 * below the builder's first-block blob-field cap at every geometry. The builder is the MOST generous for the
 * first block — it only reserves that block's own block-end overhead — so being conservative here (assuming
 * the checkpoint is full of blocks, each spending its share) is what guarantees admitted ⇒ buildable: a tx
 * admitted under this budget always fits the first block's blob-field cap, regardless of how many blocks the
 * builder ends up packing.
 *
 * @param maxBlocksPerCheckpoint - Number of blocks the checkpoint may contain; clamped to at least 1.
 */
export function getDaCheckpointBudgetForTxs(maxBlocksPerCheckpoint: number): number {
  const blocks = Math.max(1, maxBlocksPerCheckpoint);
  // Clamp at zero: for absurd geometries (blocks greater than ~4094) the per-block overhead alone exceeds the
  // raw blob capacity, which would otherwise yield a negative advertised DA budget.
  const fields = Math.max(
    0,
    BLOBS_PER_CHECKPOINT * FIELDS_PER_BLOB -
      NUM_CHECKPOINT_END_MARKER_FIELDS -
      NUM_FIRST_BLOCK_END_BLOB_FIELDS -
      (blocks - 1) * NUM_BLOCK_END_BLOB_FIELDS,
  );
  return fields * DA_GAS_PER_FIELD;
}

/**
 * Computes the maximum gas a single tx may declare on a network: the smaller of the per-tx protocol
 * maximum and the per-block allocation a proposer grants to the first block of a checkpoint. The per-block
 * allocation mirrors `CheckpointBuilder.capLimitsByCheckpointBudgets`
 * (`ceil(checkpointBudget / maxBlocksPerCheckpoint * multiplier)`) using the network-minimum multipliers, so
 * a tx declaring this much is admissible into a block under that geometry.
 *
 * This is a *network* limit: a function of network-wide constants only (timetable-derived
 * blocks-per-checkpoint, checkpoint budgets, the network-minimum multipliers). It must NOT depend on a
 * node's local restrictiveness — its multipliers configured above the network minimum, or its
 * `maxDABlockGas` / `validateMaxDABlockGas` caps — because those make a node stricter at block-building
 * time but cannot define what the network considers a valid tx for relay. The same value is advertised by
 * `getNodeInfo` and enforced by the RPC/gossip/pool gas validators.
 *
 * The DA budget is {@link getDaCheckpointBudgetForTxs} evaluated at the clamped blocks-per-checkpoint — the
 * raw blob capacity net of encoding overhead for every block — so the admission limit is consistent with the
 * builder's blob-field cap.
 *
 * @param manaCheckpointBudget - L2 (mana) budget per checkpoint (`rollupManaLimit`).
 */
export function computeNetworkTxGasLimits(opts: { maxBlocksPerCheckpoint: number; manaCheckpointBudget: number }): Gas {
  const blocks = Math.max(1, opts.maxBlocksPerCheckpoint);
  const daBudget = getDaCheckpointBudgetForTxs(blocks);

  // Clamp by the whole-checkpoint budget too: at small block counts the per-block share scaled by the
  // multiplier can exceed the checkpoint budget itself (e.g. at blocks=1 a >1 multiplier overshoots), which
  // would admit a tx no builder can ever pack — the builder caps each block by the remaining budget. Clamping
  // by the budget makes "admitted ⇒ buildable" unconditional. (For DA the per-tx maximum always binds first,
  // so the budget clamp is currently moot, but it keeps the invariant explicit.)
  const daGas = Math.min(
    MAX_TX_DA_GAS,
    daBudget,
    Math.ceil((daBudget / blocks) * MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER),
  );
  const l2Gas = Math.min(
    MAX_PROCESSABLE_L2_GAS,
    opts.manaCheckpointBudget,
    Math.ceil((opts.manaCheckpointBudget / blocks) * MIN_PER_BLOCK_ALLOCATION_MULTIPLIER),
  );

  return new Gas(daGas, l2Gas);
}

/**
 * Network tx gas limits derived from a sequencer/p2p config and the L1 slot-timing + mana constants. The
 * single source of truth shared by `getNodeInfo` (advertising) and the RPC/gossip/pool gas validators
 * (enforcing), so a node never rejects a tx it advertised as admissible. Always uses the network-minimum
 * multipliers, never the node's (possibly higher) configured multipliers.
 */
export function getNetworkTxGasLimits(
  config: ProposerTimetableConfig,
  l1Constants: SlotTimingConstants & { rollupManaLimit: number },
): Gas {
  const maxBlocksPerCheckpoint = buildProposerTimetable(config, l1Constants).getMaxBlocksPerCheckpoint();
  return computeNetworkTxGasLimits({ maxBlocksPerCheckpoint, manaCheckpointBudget: l1Constants.rollupManaLimit });
}
