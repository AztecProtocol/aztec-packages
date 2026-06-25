/** Default block sub-slot duration (`D`) in seconds, used to derive how many blocks fit in a slot. */
export const DEFAULT_BLOCK_DURATION = 3;

/** Default minimum block-building duration (`min_block_duration`) in seconds. */
export const DEFAULT_MIN_BLOCK_DURATION = 2;

/** Default one-way P2P propagation time (`p2p_propagation_time`) for proposals and attestations in seconds. */
export const DEFAULT_P2P_PROPAGATION_TIME = 2;

/** Default local checkpoint proposal preparation time (`checkpoint_proposal_prepare_time`) in seconds. */
export const DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME = 1;

/** Default local tolerance for archiver orphan-prune checks when no checkpoint proposal was received. */
export const DEFAULT_ORPHAN_PRUNE_NO_PROPOSAL_TOLERANCE = 1;

/**
 * Default proposer initialization time (`checkpoint_proposal_init_time`) in seconds: the budget reserved at
 * the start of the build frame for sync, the proposer check, and checkpoint initialization before the first
 * block sub-slot opens. The proposer rarely starts building exactly at `build_frame_start`; this offset
 * shifts the sub-slot grid so the first sub-slot still has its full duration once the prologue completes.
 */
export const DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME = 1;

/**
 * Ethereum slot duration (seconds) below which a network is treated as a fast local/e2e profile with mocked
 * p2p. Profiles at or above this keep the production operational budgets. Mainnet is 12s; fast anvil-style
 * local profiles run at 4s.
 */
export const FAST_PROFILE_ETHEREUM_SLOT_DURATION = 8;

/**
 * Operational timing budgets for the fast local/e2e profile (mocked p2p), per the README's "Local e2e with
 * mocked p2p" section. When `ethereum_slot_duration < FAST_PROFILE_ETHEREUM_SLOT_DURATION`, these cap the
 * proposer's operational budgets so a fast network does not inherit the conservative production budgets,
 * which would shrink the per-checkpoint build window and under-pack checkpoints. Explicitly configured
 * budgets below these caps are kept as-is (the budgets are clamped down, never raised).
 */
export const FAST_PROFILE_P2P_PROPAGATION_TIME = 0.5;

/** Fast-profile checkpoint proposal preparation budget (seconds). See {@link FAST_PROFILE_P2P_PROPAGATION_TIME}. */
export const FAST_PROFILE_CHECKPOINT_PROPOSAL_PREPARE_TIME = 0.5;

/** Fast-profile minimum block-building budget (seconds). See {@link FAST_PROFILE_P2P_PROPAGATION_TIME}. */
export const FAST_PROFILE_MIN_BLOCK_DURATION = 1;

/** Resolved operational timing budgets used to size the proposer build window. */
export type ResolvedTimingBudgets = {
  minBlockDuration: number;
  p2pPropagationTime: number;
  checkpointProposalPrepareTime: number;
  checkpointProposalInitTime: number;
};

/** Default consensus grace for received checkpoint proposals to materialize locally. */
export function getDefaultCheckpointProposalSyncGrace(blockDuration: number): number {
  return 2 * blockDuration;
}

/**
 * Resolves the operational timing budgets, applying the fast local/e2e profile when
 * `ethereumSlotDuration < FAST_PROFILE_ETHEREUM_SLOT_DURATION`.
 *
 * Production profiles (`ethereumSlotDuration >= FAST_PROFILE_ETHEREUM_SLOT_DURATION`) use the configured
 * budgets verbatim. Fast profiles clamp `p2pPropagationTime`, `checkpointProposalPrepareTime`, and
 * `minBlockDuration` down to the fast-profile caps so a fast network (mocked p2p) gets a build window sized
 * for local timing rather than the conservative production budgets. The clamp only lowers budgets, so an
 * operator that explicitly configured a smaller value keeps it. `checkpointProposalInitTime` is unchanged by
 * the profile: it is a proposer prologue budget, not a propagation/preparation budget.
 */
export function resolveTimingBudgets(ethereumSlotDuration: number, opts: ResolvedTimingBudgets): ResolvedTimingBudgets {
  const { minBlockDuration, p2pPropagationTime, checkpointProposalPrepareTime, checkpointProposalInitTime } = opts;

  const isFastProfile = ethereumSlotDuration < FAST_PROFILE_ETHEREUM_SLOT_DURATION;
  if (!isFastProfile) {
    return { minBlockDuration, p2pPropagationTime, checkpointProposalPrepareTime, checkpointProposalInitTime };
  }

  return {
    minBlockDuration: Math.min(minBlockDuration, FAST_PROFILE_MIN_BLOCK_DURATION),
    p2pPropagationTime: Math.min(p2pPropagationTime, FAST_PROFILE_P2P_PROPAGATION_TIME),
    checkpointProposalPrepareTime: Math.min(
      checkpointProposalPrepareTime,
      FAST_PROFILE_CHECKPOINT_PROPOSAL_PREPARE_TIME,
    ),
    checkpointProposalInitTime,
  };
}
