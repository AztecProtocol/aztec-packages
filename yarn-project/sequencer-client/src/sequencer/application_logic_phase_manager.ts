import { PublicExecutor, PublicStateDB } from '@aztec/acir-simulator';
import { Tx } from '@aztec/circuit-types';
import { BlockHeader, GlobalVariables, Proof, PublicCallRequest, PublicKernelPublicInputs } from '@aztec/circuits.js';
import { isArrayEmpty } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { MerkleTreeOperations } from '@aztec/world-state';

import { PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { ContractsDataSourcePublicDB } from '../simulator/public_executor.js';
import { PhaseManager } from './phase_manager.js';
import { FailedTx } from './processed_tx.js';

/**
 * The phase manager responsible for performing the fee preparation phase.
 */
export class ApplicationLogicPhaseManager extends PhaseManager {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected publicProver: PublicProver,
    protected globalVariables: GlobalVariables,
    protected blockHeader: BlockHeader,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,

    protected log = createDebugLogger('aztec:sequencer:application-logic'),
  ) {
    super(db, publicExecutor, publicKernel, publicProver, globalVariables, blockHeader);
  }

  extractEnqueuedPublicCalls(tx: Tx): PublicCallRequest[] {
    if (!tx.enqueuedPublicFunctionCalls || tx.enqueuedPublicFunctionCalls.length <= 1) {
      return [];
    }
    // Note: the first enqueued public call is for fee payments
    // TODO(dbanks12): why must these be reversed?
    return tx.enqueuedPublicFunctionCalls.slice().reverse().slice(1);
  }

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
    // add new contracts to the contracts db so that their functions may be found and called
    this.log(`Processing tx ${await tx.getTxHash()}`);
    await this.publicContractsDB.addNewContracts(tx);
    if (!isArrayEmpty(tx.data.endAppLogic.publicCallStack, item => item.isEmpty())) {
      const outputAndProof = this.getKernelOutputAndProof(tx, previousPublicKernelOutput, previousPublicKernelProof);

      this.log(`Executing enqueued public calls for tx ${await tx.getTxHash()}`);
      const [publicKernelOutput, publicKernelProof, newUnencryptedFunctionLogs] = await this.processEnqueuedPublicCalls(
        this.extractEnqueuedPublicCalls(tx),
        outputAndProof.publicKernelOutput,
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

  nextPhase() {
    return null;
  }

  async rollback(tx: Tx, err: unknown): Promise<FailedTx> {
    this.log.warn(`Error processing tx ${await tx.getTxHash()}: ${err}`);
    // remove contracts on failure
    await this.publicContractsDB.removeNewContracts(tx);
    // rollback any state updates from this failed transaction
    await this.publicStateDB.rollback();
    return {
      tx,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}
