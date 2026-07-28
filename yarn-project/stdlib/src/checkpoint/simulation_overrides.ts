import {
  type FeeHeader,
  RollupContract,
  SimulationOverridesBuilder,
  type SimulationOverridesPlan,
} from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';

import type { CoordinationSignatureContext } from '../p2p/signature_utils.js';
import type { ProposedCheckpointData } from './checkpoint_data.js';
import { computeCheckpointPayloadDigest } from './digest.js';

type CheckpointSimulationOverridesPlanInput = {
  /** Target rollup contract. */
  rollup: RollupContract;
  /** Checkpoint number to be proposed. */
  checkpointNumber: CheckpointNumber;
  /** Logger instance. */
  log: Logger;
  /**
   * The proposed parent checkpoint when pipelining. Its `checkpointNumber` must equal
   * `checkpointNumber - 1`; the helper enforces this. Mutually exclusive with
   * `invalidateToPendingCheckpointNumber`.
   */
  proposedCheckpointData?: ProposedCheckpointData;
  /**
   * The pending checkpoint number we'll end up at after invalidation lands. Mutually exclusive
   * with `proposedCheckpointData`.
   */
  invalidateToPendingCheckpointNumber?: CheckpointNumber;
  /**
   * The real on-chain pending checkpoint number (typically `syncedTo.checkpointedCheckpointNumber`).
   * Used as the snapshot we pin both `pending` and `proven` to avoid prunes in simulation.
   */
  checkpointedCheckpointNumber: CheckpointNumber;
  /**
   * Chain-level consensus signature context. Used to recompute the parent's `payloadDigest` for the
   * pipelined simulation override so it matches what `propose` will write into `tempCheckpointLogs[parent]`
   * once the parent lands.
   */
  signatureContext: CoordinationSignatureContext;
};

/**
 * Builds the SimulationOverridesPlan describing the simulated L1 rollup state for a checkpoint's
 * enqueue-time simulations: `canProposeAt` (in Sequencer.doWork) and the propose-related sims
 * (validateCheckpointHeader, simulateProposeTx). The plan reflects "as if our pipelined parent
 * checkpoint has landed and any required invalidation has executed" — the gap that needs to be
 * bridged at enqueue time.
 *
 * Pipelining (`proposedCheckpointData`) and invalidation (`invalidateToPendingCheckpointNumber`)
 * are mutually exclusive; passing both throws.
 */
export async function buildCheckpointSimulationOverridesPlan(
  input: CheckpointSimulationOverridesPlanInput,
): Promise<SimulationOverridesPlan | undefined> {
  if (input.proposedCheckpointData && input.invalidateToPendingCheckpointNumber !== undefined) {
    throw new Error(
      'Error in buildCheckpointSimulationOverridesPlan: proposedCheckpointData and invalidateToPendingCheckpointNumber are mutually exclusive',
    );
  }

  const builder = new SimulationOverridesBuilder();
  const pendingCheckpointNumber = derivePendingCheckpointNumber(input);

  // Override the latest checkpoint number when invalidating or pipelining, so our checkpoint
  // follows from it. We also override the proven chain tip so we dont need to worry about
  // prunes kicking in that would break out simulation if there's a prune pending. We always
  // assume that a proof will land in time. If we don't have a pending checkpoint number to force,
  // we still set both tips to the current checkpoint number to avoid the prune trigger.
  const overridenChainTip = pendingCheckpointNumber ?? input.checkpointedCheckpointNumber;
  builder.withChainTips({ pending: overridenChainTip, proven: overridenChainTip });

  if (input.proposedCheckpointData) {
    const { header, archive, checkpointOutHash, feeAssetPriceModifier, inboxMsgTotal } = input.proposedCheckpointData;
    builder.withPendingArchive(archive.root);
    // Override every locally-derivable `tempCheckpointLogs[parent]` field that L1 will eventually
    // write. `slotNumber` is required by `STFLib.canPruneAtTime`: without it the cell reads
    // slotNumber 0, the contract treats the pending tip as belonging to an expired epoch, and
    // `getEffectivePendingCheckpointNumber` silently collapses pending back to proven — producing
    // a spurious `Rollup__InvalidArchive` against the on-chain genesis archive. `inboxMsgTotal` is
    // read by `ProposeLib.validateInboxConsumption` as the parent's consumed total: left at zero it
    // makes our consumption look like the Inbox's entire history and trips
    // `Rollup__TooManyInboxMessagesConsumed`. The remaining fields (headerHash, outHash,
    // payloadDigest) are not read by `canProposeAt` / `validateCheckpointHeader`, but mirroring the full
    // cell keeps the simulation byte-faithful with what the actual `propose()` send will observe,
    // which is a defense against future reads taking dependencies on them. The parent's
    // `inboxConsumedBucket` shares the word and stays zero: no contract path reads it back.
    builder.withPendingTempCheckpointLogFields({
      headerHash: header.hash(),
      outHash: checkpointOutHash,
      slotNumber: header.slotNumber,
      inboxMsgTotal,
      payloadDigest: computeCheckpointPayloadDigest({
        header,
        archiveRoot: archive.root,
        feeAssetPriceModifier,
        signatureContext: input.signatureContext,
      }),
    });

    const feeHeader = await computePipelinedParentFeeHeader({
      checkpointNumber: input.checkpointNumber,
      proposedCheckpointData: input.proposedCheckpointData,
      rollup: input.rollup,
      log: input.log,
    });
    if (feeHeader) {
      builder.withPendingFeeHeader(feeHeader);
    }
  }

  return builder.build();
}

function derivePendingCheckpointNumber(input: CheckpointSimulationOverridesPlanInput): CheckpointNumber | undefined {
  if (input.invalidateToPendingCheckpointNumber !== undefined) {
    return input.invalidateToPendingCheckpointNumber;
  }
  if (!input.proposedCheckpointData) {
    return undefined;
  }
  if (input.checkpointNumber < 1) {
    throw new Error(`Cannot build simulation override for checkpoint ${input.checkpointNumber}: no parent exists`);
  }
  const expectedParent = CheckpointNumber(input.checkpointNumber - 1);
  if (input.proposedCheckpointData.checkpointNumber !== expectedParent) {
    throw new Error(
      `Cannot build simulation override for checkpoint ${input.checkpointNumber}: proposedCheckpointData.checkpointNumber (${input.proposedCheckpointData.checkpointNumber}) does not match expected parent ${expectedParent}`,
    );
  }
  return expectedParent;
}

type PipelinedParentFeeHeaderInput = {
  checkpointNumber: CheckpointNumber;
  proposedCheckpointData: ProposedCheckpointData;
  rollup: RollupContract;
  log: Logger;
};

/**
 * Derives the pending parent fee header used during pipelined proposal simulation. Returns
 * `undefined` only when no grandparent exists (i.e. the proposed parent is the genesis
 * checkpoint); all other failure modes (missing grandparent state, missing fee header, RPC
 * errors) throw so callers don't silently desync the fee-header override.
 */
export async function computePipelinedParentFeeHeader(
  input: PipelinedParentFeeHeaderInput,
): Promise<FeeHeader | undefined> {
  if (input.checkpointNumber < 2) {
    return undefined;
  }

  const grandparentCheckpointNumber = CheckpointNumber(input.checkpointNumber - 2);

  const [grandparentCheckpoint, manaTarget] = await Promise.all([
    input.rollup.getCheckpoint(grandparentCheckpointNumber),
    input.rollup.getManaTarget(),
  ]);

  if (!grandparentCheckpoint?.feeHeader) {
    throw new Error(
      `Grandparent checkpoint or feeHeader missing for checkpoint ${grandparentCheckpointNumber.toString()}`,
    );
  }

  return RollupContract.computeChildFeeHeader(
    grandparentCheckpoint.feeHeader,
    input.proposedCheckpointData.totalManaUsed,
    input.proposedCheckpointData.feeAssetPriceModifier,
    manaTarget,
  );
}
