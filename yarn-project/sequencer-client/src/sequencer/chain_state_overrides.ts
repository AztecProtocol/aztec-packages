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
  /** If set, overrides `tips.proven` so `canPruneAtTime` short-circuits to false at the simulation timestamp. */
  provenOverride?: CheckpointNumber;
  rollup: RollupContract;
  log: Logger;
};

/**
 * Builds the SimulationOverridesPlan describing the simulated L1 rollup state for a checkpoint's
 * enqueue-time simulations: `canProposeAt` (in Sequencer.doWork) and the propose-related sims
 * (validateBlockHeader, simulateProposeTx). The plan reflects "as if our pipelined parent
 * checkpoint has landed and any required invalidation has executed" — the gap that needs to be
 * bridged at enqueue time.
 *
 * The bundle simulate at send time deliberately does NOT consume this plan — by then the parent
 * is actually on L1 and the overrides would lie about chain state.
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
  }
  if (feeHeader) {
    builder.withPendingFeeHeader(feeHeader);
  }
  if (input.provenOverride !== undefined) {
    builder.withChainTips({ proven: input.provenOverride });
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
