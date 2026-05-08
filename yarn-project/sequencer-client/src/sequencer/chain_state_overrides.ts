import { RollupContract, SimulationOverridesBuilder, type SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import type { ProposedCheckpointData } from '@aztec/stdlib/checkpoint';

type PipelinedParentSimulationOverridesPlanInput = {
  checkpointNumber: CheckpointNumber;
  proposedCheckpointData?: ProposedCheckpointData;
  rollup: RollupContract;
  log: Logger;
  /**
   * Whether proposer pipelining is enabled. Controls only the parent pending/fee-header
   * portion of the plan — the proven override below is independent of pipelining because
   * the boundary build needs it for globals and enqueue-time validation regardless.
   */
  pipeliningEnabled: boolean;
  /** If set, also overrides `tips.proven` so `canPruneAtTime` returns false at the simulation timestamp. */
  prunePending?: { provenOverride: CheckpointNumber };
};

type SubmissionSimulationOverridesPlanInput = {
  pipelinedParentPlan?: SimulationOverridesPlan;
  invalidateToPendingCheckpointNumber?: CheckpointNumber;
  lastArchiveRoot: Fr;
  pipeliningEnabled: boolean;
};

/**
 * Builds the simulated chain view used while constructing a checkpoint proposal. May carry:
 * - A pending parent override + fee header (only when pipelining is enabled).
 * - A proven override (whenever `prunePending` is set, even with pipelining off — the boundary
 *   build needs it for the globals builder's mana-min-fee lookup and the enqueue-time
 *   submission simulation regardless of pipelining).
 */
export async function buildPipelinedParentSimulationOverridesPlan(
  input: PipelinedParentSimulationOverridesPlanInput,
): Promise<SimulationOverridesPlan | undefined> {
  const builder = new SimulationOverridesBuilder();

  if (input.pipeliningEnabled) {
    const parentCheckpointNumber = CheckpointNumber(input.checkpointNumber - 1);
    builder.withChainTips({ pending: parentCheckpointNumber });
    const pendingFeeHeader = await computePipelinedParentFeeHeader(input);
    if (pendingFeeHeader) {
      builder.withPendingFeeHeader(pendingFeeHeader);
    }
  }

  if (input.prunePending) {
    builder.withChainTips({ proven: input.prunePending.provenOverride });
  }

  return builder.build();
}

/** Builds the simulated chain view used when validating and enqueueing checkpoint submission. */
export function buildSubmissionSimulationOverridesPlan(
  input: SubmissionSimulationOverridesPlanInput,
): SimulationOverridesPlan | undefined {
  const pendingCheckpointNumber =
    input.invalidateToPendingCheckpointNumber ?? input.pipelinedParentPlan?.chainTipsOverride?.pending;

  const builder = SimulationOverridesBuilder.from(input.pipelinedParentPlan);
  if (pendingCheckpointNumber !== undefined) {
    builder.withChainTips({ pending: pendingCheckpointNumber });
  }

  if (input.pipeliningEnabled && pendingCheckpointNumber !== undefined) {
    builder.withPendingArchive(input.lastArchiveRoot);
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
