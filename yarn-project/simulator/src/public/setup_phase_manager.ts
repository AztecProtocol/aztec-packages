import { PublicKernelType, type PublicProvingRequest, type Tx } from '@aztec/circuit-types';
import { type PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

import { AbstractPhaseManager, type PhaseConfig, makeAvmProvingRequest } from './abstract_phase_manager.js';

/**
 * The phase manager responsible for performing the fee preparation phase.
 */
export class SetupPhaseManager extends AbstractPhaseManager {
  constructor(config: PhaseConfig, public override phase: PublicKernelType = PublicKernelType.SETUP) {
    super(config);
  }

  override async handle(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    previousCircuit: ProtocolArtifact,
  ) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    // TODO(#6464): Should we allow emitting contracts in the private setup phase?
    // if so, this should only add contracts that were deployed during private app logic.
    await this.worldStateDB.addNewContracts(tx);
    const { publicProvingInformation, kernelOutput, lastKernelArtifact, newUnencryptedLogs, revertReason, gasUsed } =
      await this.processEnqueuedPublicCalls(tx, previousPublicKernelOutput, previousCircuit).catch(
        // the abstract phase manager throws if simulation gives error in a non-revertible phase
        async err => {
          await this.worldStateDB.rollbackToCommit();
          throw err;
        },
      );
    tx.unencryptedLogs.addFunctionLogs(newUnencryptedLogs);
    await this.worldStateDB.checkpoint();

    // Return a list of setup proving requests
    const publicProvingRequests: PublicProvingRequest[] = publicProvingInformation.map(info => {
      return makeAvmProvingRequest(info, PublicKernelType.SETUP);
    });
    return {
      publicProvingRequests,
      publicKernelOutput: kernelOutput,
      lastKernelArtifact,
      revertReason,
      returnValues: [],
      gasUsed,
    };
  }
}
