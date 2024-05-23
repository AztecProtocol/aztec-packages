import { type PublicKernelRequest, PublicKernelType, type Tx } from '@aztec/circuit-types';
import { type GlobalVariables, type Header, type PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';
import { type PublicExecutor, type PublicStateDB } from '@aztec/simulator';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { AbstractPhaseManager, PublicKernelPhase } from './abstract_phase_manager.js';
import { type ContractsDataSourcePublicDB } from './public_executor.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

/**
 * The phase manager responsible for performing the fee preparation phase.
 */
export class SetupPhaseManager extends AbstractPhaseManager {
  constructor(
    db: MerkleTreeOperations,
    publicExecutor: PublicExecutor,
    publicKernel: PublicKernelCircuitSimulator,
    globalVariables: GlobalVariables,
    historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    phase: PublicKernelPhase = PublicKernelPhase.SETUP,
  ) {
    super(db, publicExecutor, publicKernel, globalVariables, historicalHeader, phase);
  }

  override async handle(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    const [kernelInputs, publicKernelOutput, newUnencryptedFunctionLogs, revertReason, _returnValues, gasUsed] =
      await this.processEnqueuedPublicCalls(tx, previousPublicKernelOutput).catch(
        // the abstract phase manager throws if simulation gives error in a non-revertible phase
        async err => {
          await this.publicStateDB.rollbackToCommit();
          throw err;
        },
      );
    tx.unencryptedLogs.addFunctionLogs(newUnencryptedFunctionLogs);
    await this.publicStateDB.checkpoint();

    // Return a list of setup proving requests
    const kernelRequests = kernelInputs.map(input => {
      const request: PublicKernelRequest = {
        type: PublicKernelType.SETUP,
        inputs: input,
      };
      return request;
    });
    return {
      kernelRequests,
      kernelInputs,
      publicKernelOutput,
      revertReason,
      returnValues: [],
      gasUsed,
    };
  }
}
