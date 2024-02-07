import { Tx } from '@aztec/circuit-types';
import { GlobalVariables, Header, Proof, PublicCallRequest, PublicKernelPublicInputs } from '@aztec/circuits.js';
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
    const metaHwm = tx.data.metaHwm.toBigInt();
    const enqueuedIrrevertiblePublicFunctionCalls = tx.enqueuedPublicFunctionCalls.filter(
      call => call.callContext.startSideEffectCounter < metaHwm,
    );

    if (enqueuedIrrevertiblePublicFunctionCalls.length > 2) {
      throw new Error(
        `Too many enqueued irrevertible public calls in tx ${tx.getTxHash()}. Max 2 allowed. Received ${
          enqueuedIrrevertiblePublicFunctionCalls.length
        }`,
      );
    } else if (enqueuedIrrevertiblePublicFunctionCalls.length === 2) {
      // if there are two enqueued irrevertible public calls,
      // the first is the fee preparation call and the second is the fee distribution call
      return [enqueuedIrrevertiblePublicFunctionCalls[0]];
    } else {
      // if there is only one enqueued irrevertible public call,
      // it is the fee distribution call
      return [];
    }
  }

  // this is a no-op for now
  async handle(
    tx: Tx,
    previousPublicKernelOutput?: PublicKernelPublicInputs,
    previousPublicKernelProof?: Proof,
  ): Promise<{
    /**
     * the output of the public kernel circuit for this phase
     */
    publicKernelOutput?: PublicKernelPublicInputs;
    /**
     * the proof of the public kernel circuit for this phase
     */
    publicKernelProof?: Proof;
  }> {
    this.log.debug(`Handle ${await tx.getTxHash()} with no-op`);
    return {
      publicKernelOutput: previousPublicKernelOutput,
      publicKernelProof: previousPublicKernelProof,
    };
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
    return {
      tx,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}
