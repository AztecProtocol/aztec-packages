import { type PublicKernelRequest, PublicKernelType, type Tx } from '@aztec/circuit-types';
import {
  type KernelCircuitPublicInputs,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  type PublicKernelCircuitPublicInputs,
  PublicKernelTailCircuitPrivateInputs,
  mergeAccumulatedData,
} from '@aztec/circuits.js';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

import { AbstractPhaseManager, type PhaseConfig } from './abstract_phase_manager.js';

export class TailPhaseManager extends AbstractPhaseManager {
  constructor(config: PhaseConfig, public override phase: PublicKernelType = PublicKernelType.TAIL) {
    super(config);
  }

  override async handle(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    previousKernelArtifact: ProtocolArtifact,
  ) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    const [inputs, finalKernelOutput] = await this.simulate(previousPublicKernelOutput, previousKernelArtifact).catch(
      // the abstract phase manager throws if simulation gives error in non-revertible phase
      async err => {
        await this.worldStateDB.rollbackToCommit();
        throw err;
      },
    );

    // Return a tail proving request
    const kernelRequest: PublicKernelRequest = {
      type: PublicKernelType.TAIL,
      inputs: inputs,
    };

    return {
      publicProvingRequests: [kernelRequest],
      publicKernelOutput: previousPublicKernelOutput,
      lastKernelArtifact: 'PublicKernelTailArtifact' as ProtocolArtifact,
      finalKernelOutput,
      returnValues: [],
    };
  }

  private async simulate(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousKernelArtifact: ProtocolArtifact,
  ): Promise<[PublicKernelTailCircuitPrivateInputs, KernelCircuitPublicInputs]> {
    const inputs = await this.buildPrivateInputs(previousOutput, previousKernelArtifact);
    // We take a deep copy (clone) of these to pass to the prover
    return [inputs.clone(), await this.publicKernel.publicKernelCircuitTail(inputs)];
  }

  private async buildPrivateInputs(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousKernelArtifact: ProtocolArtifact,
  ) {
    const previousKernel = this.getPreviousKernelData(previousOutput, previousKernelArtifact);

    const { validationRequests, endNonRevertibleData: nonRevertibleData, end: revertibleData } = previousOutput;

    const noteHashReadRequestHints = await this.hintsBuilder.getNoteHashReadRequestsHints(
      validationRequests.noteHashReadRequests,
    );

    const pendingNullifiers = mergeAccumulatedData(
      nonRevertibleData.nullifiers,
      revertibleData.nullifiers,
      MAX_NULLIFIERS_PER_TX,
    );

    const nullifierReadRequestHints = await this.hintsBuilder.getNullifierReadRequestHints(
      validationRequests.nullifierReadRequests,
      pendingNullifiers,
    );

    const nullifierNonExistentReadRequestHints = await this.hintsBuilder.getNullifierNonExistentReadRequestHints(
      validationRequests.nullifierNonExistentReadRequests,
      pendingNullifiers,
    );

    const l1ToL2MsgReadRequestHints = await this.hintsBuilder.getL1ToL2MsgReadRequestsHints(
      validationRequests.l1ToL2MsgReadRequests,
    );

    const pendingPublicDataWrites = mergeAccumulatedData(
      nonRevertibleData.publicDataUpdateRequests,
      revertibleData.publicDataUpdateRequests,
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    );

    const publicDataHints = await this.hintsBuilder.getPublicDataHints(
      validationRequests.publicDataReads,
      pendingPublicDataWrites,
    );

    const currentState = await this.db.getStateReference();

    return new PublicKernelTailCircuitPrivateInputs(
      previousKernel,
      noteHashReadRequestHints,
      nullifierReadRequestHints,
      nullifierNonExistentReadRequestHints,
      l1ToL2MsgReadRequestHints,
      publicDataHints,
      currentState.partial,
    );
  }
}
