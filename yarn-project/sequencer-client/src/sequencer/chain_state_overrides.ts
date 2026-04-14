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
};

type SubmissionSimulationOverridesPlanInput = {
  pipelinedParentPlan?: SimulationOverridesPlan;
  invalidateToPendingCheckpointNumber?: CheckpointNumber;
  lastArchiveRoot: Fr;
  pipeliningEnabled: boolean;
};

/** Builds the simulated parent checkpoint view used while constructing a pipelined proposal. */
export async function buildPipelinedParentSimulationOverridesPlan(
  input: PipelinedParentSimulationOverridesPlanInput,
): Promise<SimulationOverridesPlan | undefined> {
  const parentCheckpointNumber = CheckpointNumber(input.checkpointNumber - 1);
  const builder = new SimulationOverridesBuilder().forPendingCheckpoint(parentCheckpointNumber);

  const pendingFeeHeader = await computePipelinedParentFeeHeader(input);
  if (pendingFeeHeader) {
    builder.withPendingFeeHeader(pendingFeeHeader);
  }

  return builder.build();
}

/** Builds the simulated chain view used when validating and enqueueing checkpoint submission. */
export function buildSubmissionSimulationOverridesPlan(
  input: SubmissionSimulationOverridesPlanInput,
): SimulationOverridesPlan | undefined {
  const pendingCheckpointNumber =
    input.invalidateToPendingCheckpointNumber ?? input.pipelinedParentPlan?.pendingCheckpointNumber;

  const builder = SimulationOverridesBuilder.from(input.pipelinedParentPlan).forPendingCheckpoint(
    pendingCheckpointNumber,
  );

  if (input.pipeliningEnabled && pendingCheckpointNumber !== undefined) {
    builder.withPendingArchive(input.lastArchiveRoot);
  }

  return builder.build();
}

/** Derives the pending parent fee header used during pipelined proposal simulation. */
export async function computePipelinedParentFeeHeader(input: PipelinedParentSimulationOverridesPlanInput) {
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
