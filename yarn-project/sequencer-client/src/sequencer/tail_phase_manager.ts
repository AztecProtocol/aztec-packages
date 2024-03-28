import { Tx } from '@aztec/circuit-types';
import {
  GlobalVariables,
  Header,
  KernelCircuitPublicInputs,
  Proof,
  PublicKernelCircuitPublicInputs,
  PublicKernelTailCircuitPrivateInputs,
} from '@aztec/circuits.js';
import { PublicExecutor, PublicStateDB } from '@aztec/simulator';
import { MerkleTreeOperations } from '@aztec/world-state';

import { PublicProver } from '../prover/index.js';
import { PublicKernelCircuitSimulator } from '../simulator/index.js';
import { ContractsDataSourcePublicDB } from '../simulator/public_executor.js';
import { AbstractPhaseManager, PublicKernelPhase } from './abstract_phase_manager.js';

export class TailPhaseManager extends AbstractPhaseManager {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected publicProver: PublicProver,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    public readonly phase: PublicKernelPhase = PublicKernelPhase.TAIL,
  ) {
    super(db, publicExecutor, publicKernel, publicProver, globalVariables, historicalHeader, phase);
  }

  async handle(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs, previousPublicKernelProof: Proof) {
    this.log(`Processing tx ${tx.getTxHash()}`);
    const [finalKernelOutput, publicKernelProof] = await this.runTailKernelCircuit(
      previousPublicKernelOutput,
      previousPublicKernelProof,
    ).catch(
      // the abstract phase manager throws if simulation gives error in non-revertible phase
      async err => {
        await this.publicStateDB.rollbackToCommit();
        throw err;
      },
    );

    // commit the state updates from this transaction
    await this.publicStateDB.commit();

    return {
      publicKernelOutput: previousPublicKernelOutput,
      finalKernelOutput,
      publicKernelProof,
      revertReason: undefined,
    };
  }

  private async runTailKernelCircuit(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousProof: Proof,
  ): Promise<[KernelCircuitPublicInputs, Proof]> {
    const output = await this.simulate(previousOutput, previousProof);
    const proof = await this.publicProver.getPublicTailKernelCircuitProof(output);
    return [output, proof];
  }

  private async simulate(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousProof: Proof,
  ): Promise<KernelCircuitPublicInputs> {
    const previousKernel = this.getPreviousKernelData(previousOutput, previousProof);

    const { validationRequests, endNonRevertibleData, end } = previousOutput;
    const nullifierReadRequestHints = await this.hintsBuilder.getNullifierReadRequestHints(
      validationRequests.nullifierReadRequests,
      endNonRevertibleData.newNullifiers,
      end.newNullifiers,
    );
    const nullifierNonExistentReadRequestHints = await this.hintsBuilder.getNullifierNonExistentReadRequestHints(
      validationRequests.nullifierNonExistentReadRequests,
      endNonRevertibleData.newNullifiers,
      end.newNullifiers,
    );
    const inputs = new PublicKernelTailCircuitPrivateInputs(
      previousKernel,
      nullifierReadRequestHints,
      nullifierNonExistentReadRequestHints,
    );
    return this.publicKernel.publicKernelCircuitTail(inputs);
  }
}
