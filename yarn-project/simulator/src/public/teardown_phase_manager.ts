import { type PublicKernelRequest, PublicKernelType, type Tx } from '@aztec/circuit-types';
import {
  type GlobalVariables,
  type Header,
  type Proof,
  type PublicKernelCircuitPublicInputs,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import {
  type PublicExecution,
  type PublicExecutionResult,
  type PublicExecutor,
  type PublicStateDB,
  isPublicExecutionResult,
} from '@aztec/simulator';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { AbstractPhaseManager, PublicKernelPhase } from './abstract_phase_manager.js';
import { type ContractsDataSourcePublicDB } from './public_executor.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

/**
 * The phase manager responsible for performing the fee preparation phase.
 */
export class TeardownPhaseManager extends AbstractPhaseManager {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    public phase: PublicKernelPhase = PublicKernelPhase.TEARDOWN,
  ) {
    super(db, publicExecutor, publicKernel, globalVariables, historicalHeader, phase);
  }

  override async handle(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    previousPublicKernelProof: Proof,
  ) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    const [kernelInputs, publicKernelOutput, publicKernelProof, newUnencryptedFunctionLogs, revertReason] =
      await this.processEnqueuedPublicCalls(tx, previousPublicKernelOutput, previousPublicKernelProof).catch(
        // the abstract phase manager throws if simulation gives error in a non-revertible phase
        async err => {
          await this.publicStateDB.rollbackToCommit();
          throw err;
        },
      );
    tx.unencryptedLogs.addFunctionLogs(newUnencryptedFunctionLogs);
    await this.publicStateDB.checkpoint();

    // Return a list of teardown proving requests
    const kernelRequests = kernelInputs.map(input => {
      const request: PublicKernelRequest = {
        type: PublicKernelType.TEARDOWN,
        inputs: input,
      };
      return request;
    });
    return {
      kernelRequests,
      kernelInputs,
      publicKernelOutput,
      publicKernelProof,
      revertReason,
      returnValues: undefined,
    };
  }

  protected override tweakCurrentExecutionBeforeSimulation(
    current: PublicExecution | PublicExecutionResult,
    previousKernelOutput: PublicKernelCircuitPublicInputs,
  ): void {
    if (isPublicExecutionResult(current)) {
      return;
    }
    current.callContext.transactionFee = computeTransactionFee(current, previousKernelOutput);
  }
}

function computeTransactionFee(_current: PublicExecution, _previousKernelOutput: PublicKernelCircuitPublicInputs): Fr {
  return Fr.ONE; // TODO: Implement me!
}
