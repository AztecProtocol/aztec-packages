import { RollupContract, SimulationOverridesBuilder, type SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';

type CheckpointSimulationOverridesPlanInput = {
  checkpointNumber: CheckpointNumber;
  proposedCheckpointData?: ProposedCheckpointData;
  invalidateToPendingCheckpointNumber?: CheckpointNumber;
  /**
   * The archive root to set on the pending checkpoint when pipelining. Undefined for early
   * (pre-build) callers like canProposeAt that do not yet have a built checkpoint.
   */
  lastArchiveRoot?: Fr;
  /**
   * Whether the rollup contract will treat the target slot as the start of a prune. When true,
   * the plan overrides `tips.proven` so `canPruneAtTime` short-circuits to false at simulation
   * time. Callers are expected to compute this with `l2BlockSource.isPruneDueAtSlot(targetSlot)`.
   */
  isPruneDueAtSlot: boolean;
  /**
   * The real on-chain pending checkpoint number (typically `syncedTo.checkpointedCheckpointNumber`
   * or `l2BlockSource.getL2Tips().checkpointed.checkpoint.number`). Used as the fallback
   * `proven` override when `isPruneDueAtSlot` is true and no other pending override is set.
   */
  checkpointedCheckpointNumber: CheckpointNumber;
  rollup: RollupContract;
  log: Logger;
};

/**
 * Builds the SimulationOverridesPlan describing the simulated L1 rollup state for a checkpoint's
 * enqueue-time simulations: `canProposeAt` (in Sequencer.doWork) and the propose-related sims
 * (validateBlockHeader, simulateProposeTx). The plan reflects "as if our pipelined parent
 * checkpoint has landed and any required invalidation has executed" — the gap that needs to be
 * bridged at enqueue time.
 */
export async function buildCheckpointSimulationOverridesPlan(
  input: CheckpointSimulationOverridesPlanInput,
): Promise<SimulationOverridesPlan | undefined> {
  const feeHeader = await computePipelinedParentFeeHeader(input);

  const pendingCheckpointNumber =
    input.invalidateToPendingCheckpointNumber ??
    (input.proposedCheckpointData ? CheckpointNumber(input.checkpointNumber - 1) : undefined);

  const builder = new SimulationOverridesBuilder();
  if (pendingCheckpointNumber !== undefined) {
    builder.withChainTips({ pending: pendingCheckpointNumber });
    if (input.lastArchiveRoot !== undefined) {
      builder.withPendingArchive(input.lastArchiveRoot);
    }
    // When pipelining with a proposed parent we must also override the parent's
    // tempCheckpointLogs.slotNumber: without it `STFLib.canPruneAtTime` reads a slotNumber of 0
    // for the overridden pending tip, decides the tip is in a long-expired epoch, and reports the
    // chain as prunable. `getEffectivePendingCheckpointNumber` then collapses pending back to
    // proven and the pending override is silently bypassed, producing a spurious
    // `Rollup__InvalidArchive` against the on-chain genesis archive. The invalidate-only override
    // path does not have a proposed parent to read the slot from; it relies on the absence of an
    // unproven pending tip to avoid this code path.
    if (input.proposedCheckpointData) {
      builder.withPendingTempCheckpointLogFields({
        slotNumber: input.proposedCheckpointData.header.slotNumber,
      });
    }
  }
  if (feeHeader) {
    builder.withPendingFeeHeader(feeHeader);
  }
  if (input.isPruneDueAtSlot) {
    // Force `proven == pending` in simulation so `canPruneAtTime` short-circuits to false.
    // Prefer the pending override we may have just installed (pipelining/invalidating); fall back
    // to the real on-chain pending tip when no override applies.
    const provenOverride = pendingCheckpointNumber ?? input.checkpointedCheckpointNumber;
    builder.withChainTips({ proven: provenOverride });
  }

  return builder.build();
}

type PipelinedParentFeeHeaderInput = {
  checkpointNumber: CheckpointNumber;
  proposedCheckpointData?: ProposedCheckpointData;
  rollup: RollupContract;
  log: Logger;
};

/** Derives the pending parent fee header used during pipelined proposal simulation. */
export async function computePipelinedParentFeeHeader(input: PipelinedParentFeeHeaderInput) {
  if (!input.proposedCheckpointData || input.checkpointNumber < 2) {
    return undefined;
  }

  const grandparentCheckpointNumber = CheckpointNumber(input.checkpointNumber - 2);

  try {
    const [grandparentCheckpoint, manaTarget] = await Promise.all([
      input.rollup.getCheckpoint(grandparentCheckpointNumber),
      input.rollup.getManaTarget(),
    ]);

    if (!grandparentCheckpoint?.feeHeader) {
      input.log.error(
        `Grandparent checkpoint or feeHeader missing for checkpoint ${grandparentCheckpointNumber.toString()}`,
      );
      return undefined;
    }

    return RollupContract.computeChildFeeHeader(
      grandparentCheckpoint.feeHeader,
      input.proposedCheckpointData.totalManaUsed,
      input.proposedCheckpointData.feeAssetPriceModifier,
      manaTarget,
    );
  } catch (err) {
    input.log.error(
      `Failed to derive pipelined parent fee header for checkpoint ${grandparentCheckpointNumber.toString()}: ${err}`,
    );
    return undefined;
  }
}
