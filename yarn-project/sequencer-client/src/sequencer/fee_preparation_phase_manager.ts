import { Tx } from '@aztec/circuit-types';
import { GlobalVariables, Header, Proof, PublicCallRequest, PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';
import { isArrayEmpty } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { PublicExecutor, PublicStateDB } from '@aztec/simulator';
import { MerkleTreeOperations } from '@aztec/world-state';

import { PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { ContractsDataSourcePublicDB } from '../simulator/public_executor.js';
import { AbstractPhaseManager } from './abstract_phase_manager.js';
import { ApplicationLogicPhaseManager } from './application_logic_phase_manager.js';
import { FailedTx } from './processed_tx.js';

/**
 * The phase manager responsible for performing the fee preparation phase.
 */
export class FeePreparationPhaseManager extends AbstractPhaseManager {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected publicProver: PublicProver,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,

    protected log = createDebugLogger('aztec:sequencer:fee-preparation'),
  ) {
    super(db, publicExecutor, publicKernel, publicProver, globalVariables, historicalHeader);
  }

  extractEnqueuedPublicCalls(tx: Tx): PublicCallRequest[] {
    const enqueuedCallRequests = tx.enqueuedPublicFunctionCalls
      .slice()
      // TODO(fees) why are we reversing here? this question is asked elsewhere
      .reverse()
      .map(call => call.toCallRequest());

    // find the last enqueued call that is not revertible
    const lastNonRevertibleCallIndex = enqueuedCallRequests.findLastIndex(
      c => tx.data.endNonRevertibleData.publicCallStack.findIndex(p => p.equals(c)) !== -1,
    );

    if (lastNonRevertibleCallIndex === -1) {
      return [];
    } else {
      // Note: we're dropping the final non-revertible call, as it will be handled in teardown
      return tx.enqueuedPublicFunctionCalls.slice(0, lastNonRevertibleCallIndex);
    }
  }

  // this is a no-op for now
  async handle(
    tx: Tx,
    previousPublicKernelOutput?: PublicKernelCircuitPublicInputs,
    previousPublicKernelProof?: Proof,
  ): Promise<{
    /**
     * the output of the public kernel circuit for this phase
     */
    publicKernelOutput?: PublicKernelCircuitPublicInputs;
    /**
     * the proof of the public kernel circuit for this phase
     */
    publicKernelProof?: Proof;
  }> {
    this.log(`Processing tx ${await tx.getTxHash()}`);
    if (!isArrayEmpty(tx.data.endNonRevertibleData.publicCallStack, item => item.isEmpty())) {
      const outputAndProof = this.getKernelOutputAndProof(tx, previousPublicKernelOutput, previousPublicKernelProof);

      this.log(`Executing enqueued public calls for tx ${await tx.getTxHash()}`);
      const [publicKernelOutput, publicKernelProof, newUnencryptedFunctionLogs] = await this.processEnqueuedPublicCalls(
        this.extractEnqueuedPublicCalls(tx),
        outputAndProof.publicKernelPublicInput,
        outputAndProof.publicKernelProof,
      );
      tx.unencryptedLogs.addFunctionLogs(newUnencryptedFunctionLogs);

      // commit the state updates from this transaction
      await this.publicStateDB.commit();

      return { publicKernelOutput, publicKernelProof };
    } else {
      return {
        publicKernelOutput: undefined,
        publicKernelProof: undefined,
      };
    }
  }

  nextPhase(): AbstractPhaseManager {
    return new ApplicationLogicPhaseManager(
      this.db,
      this.publicExecutor,
      this.publicKernel,
      this.publicProver,
      this.globalVariables,
      this.historicalHeader,
      this.publicContractsDB,
      this.publicStateDB,
    );
  }

  async rollback(tx: Tx, err: unknown): Promise<FailedTx> {
    this.log.warn(`Error processing tx ${await tx.getTxHash()}: ${err}`);
    await this.publicStateDB.rollback();
    return {
      tx,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}
