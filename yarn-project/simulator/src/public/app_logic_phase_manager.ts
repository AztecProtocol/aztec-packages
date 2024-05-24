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
export class AppLogicPhaseManager extends AbstractPhaseManager {
  constructor(
    db: MerkleTreeOperations,
    publicExecutor: PublicExecutor,
    publicKernel: PublicKernelCircuitSimulator,
    globalVariables: GlobalVariables,
    historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    phase: PublicKernelPhase = PublicKernelPhase.APP_LOGIC,
  ) {
    super(db, publicExecutor, publicKernel, globalVariables, historicalHeader, phase);
  }

  override async handle(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs) {
    // add new contracts to the contracts db so that their functions may be found and called
    // TODO(#4073): This is catching only private deployments, when we add public ones, we'll
    // have to capture contracts emitted in that phase as well.
    // TODO(@spalladino): Should we allow emitting contracts in the fee preparation phase?
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    // add new contracts to the contracts db so that their functions may be found and called
    // TODO(#6464): Should we allow emitting contracts in the private setup phase?
    // if so, this should only add contracts that were deployed during private app logic.
    await this.publicContractsDB.addNewContracts(tx);
    const [kernelInputs, publicKernelOutput, newUnencryptedFunctionLogs, revertReason, returnValues, gasUsed] =
      await this.processEnqueuedPublicCalls(tx, previousPublicKernelOutput).catch(
        // if we throw for any reason other than simulation, we need to rollback and drop the TX
        async err => {
          await this.publicStateDB.rollbackToCommit();
          throw err;
        },
      );

    if (revertReason) {
      // TODO(#6464): Should we allow emitting contracts in the private setup phase?
      // if so, this is removing contracts deployed in private setup
      await this.publicContractsDB.removeNewContracts(tx);
      await this.publicStateDB.rollbackToCheckpoint();
    } else {
      tx.unencryptedLogs.addFunctionLogs(newUnencryptedFunctionLogs);
      // TODO(#6470): we should be adding contracts deployed in those logs to the publicContractsDB
    }

    // Return a list of app logic proving requests
    const kernelRequests = kernelInputs.map(input => {
      const request: PublicKernelRequest = {
        type: PublicKernelType.APP_LOGIC,
        inputs: input,
      };
      return request;
    });
    return { kernelRequests, publicKernelOutput, revertReason, returnValues, gasUsed };
  }
}
