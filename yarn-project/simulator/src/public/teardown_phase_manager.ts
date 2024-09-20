import { PublicKernelType, type PublicProvingRequest, type Tx } from '@aztec/circuit-types';
import { type Fr, type Gas, type PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

import { inspect } from 'util';

import { AbstractPhaseManager, type PhaseConfig, makeAvmProvingRequest } from './abstract_phase_manager.js';

/**
 * The phase manager responsible for performing the fee preparation phase.
 */
export class TeardownPhaseManager extends AbstractPhaseManager {
  constructor(config: PhaseConfig, public override phase: PublicKernelType = PublicKernelType.TEARDOWN) {
    super(config);
  }

  override async handle(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    previousKernelArtifact: ProtocolArtifact,
  ) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    const { publicProvingInformation, kernelOutput, lastKernelArtifact, newUnencryptedLogs, revertReason, gasUsed } =
      await this.processEnqueuedPublicCalls(tx, previousPublicKernelOutput, previousKernelArtifact).catch(
        // the abstract phase manager throws if simulation gives error in a non-revertible phase
        async err => {
          await this.worldStateDB.rollbackToCommit();
          throw err;
        },
      );
    if (revertReason) {
      await this.worldStateDB.rollbackToCheckpoint();
      tx.filterRevertedLogs(kernelOutput);
    } else {
      // TODO(#6464): Should we allow emitting contracts in the public teardown phase?
      // if so, we should insert them here
      tx.unencryptedLogs.addFunctionLogs(newUnencryptedLogs);
    }

    // Return a list of teardown proving requests
    const publicProvingRequests: PublicProvingRequest[] = publicProvingInformation.map(info => {
      return makeAvmProvingRequest(info, PublicKernelType.TEARDOWN);
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

  protected override getTransactionFee(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs): Fr {
    const gasSettings = tx.data.constants.txContext.gasSettings;
    const gasFees = this.globalVariables.gasFees;
    // No need to add teardown limits since they are already included in end.gasUsed
    const gasUsed = previousPublicKernelOutput.end.gasUsed.add(previousPublicKernelOutput.endNonRevertibleData.gasUsed);
    const txFee = gasSettings.inclusionFee.add(gasUsed.computeFee(gasFees));
    this.log.debug(`Computed tx fee`, { txFee, gasUsed: inspect(gasUsed), gasFees: inspect(gasFees) });
    return txFee;
  }

  protected override getAvailableGas(tx: Tx, _previousPublicKernelOutput: PublicKernelCircuitPublicInputs): Gas {
    return tx.data.constants.txContext.gasSettings.getTeardownLimits();
  }
}
