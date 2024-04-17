import { type PublicKernelRequest, PublicKernelType, type Tx } from '@aztec/circuit-types';
import {
  type Fr,
  type GlobalVariables,
  type Header,
  type KernelCircuitPublicInputs,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  type Proof,
  type PublicKernelCircuitPublicInputs,
  PublicKernelTailCircuitPrivateInputs,
  type SideEffect,
  makeEmptyProof,
  mergeAccumulatedData,
  sortByCounter,
} from '@aztec/circuits.js';
import { type Tuple } from '@aztec/foundation/serialize';
import { type PublicExecutor, type PublicStateDB } from '@aztec/simulator';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { AbstractPhaseManager, PublicKernelPhase } from './abstract_phase_manager.js';
import { type ContractsDataSourcePublicDB } from './public_executor.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

export class TailPhaseManager extends AbstractPhaseManager {
  constructor(
    db: MerkleTreeOperations,
    publicExecutor: PublicExecutor,
    publicKernel: PublicKernelCircuitSimulator,
    globalVariables: GlobalVariables,
    historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    phase: PublicKernelPhase = PublicKernelPhase.TAIL,
  ) {
    super(db, publicExecutor, publicKernel, globalVariables, historicalHeader, phase);
  }

  async handle(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs, previousPublicKernelProof: Proof) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
    const [inputs, finalKernelOutput] = await this.runTailKernelCircuit(
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

    // Return a tail proving request
    const request: PublicKernelRequest = {
      type: PublicKernelType.TAIL,
      inputs: inputs,
    };

    return {
      kernelRequests: [request],
      publicKernelOutput: previousPublicKernelOutput,
      finalKernelOutput,
      publicKernelProof: makeEmptyProof(),
      revertReason: undefined,
      returnValues: undefined,
    };
  }

  private async runTailKernelCircuit(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousProof: Proof,
  ): Promise<[PublicKernelTailCircuitPrivateInputs, KernelCircuitPublicInputs]> {
    const [inputs, output] = await this.simulate(previousOutput, previousProof);

    // Temporary hack. Should sort them in the tail circuit.
    const noteHashes = mergeAccumulatedData(
      MAX_NEW_NOTE_HASHES_PER_TX,
      previousOutput.endNonRevertibleData.newNoteHashes,
      previousOutput.end.newNoteHashes,
    );
    output.end.newNoteHashes = this.sortNoteHashes<typeof MAX_NEW_NOTE_HASHES_PER_TX>(noteHashes);

    return [inputs, output];
  }

  private async simulate(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousProof: Proof,
  ): Promise<[PublicKernelTailCircuitPrivateInputs, KernelCircuitPublicInputs]> {
    const inputs = await this.buildPrivateInputs(previousOutput, previousProof);
    // We take a deep copy (clone) of these to pass to the prover
    return [inputs.clone(), await this.publicKernel.publicKernelCircuitTail(inputs)];
  }

  private async buildPrivateInputs(previousOutput: PublicKernelCircuitPublicInputs, previousProof: Proof) {
    const previousKernel = this.getPreviousKernelData(previousOutput, previousProof);

    const { validationRequests, endNonRevertibleData, end } = previousOutput;

    const pendingNullifiers = mergeAccumulatedData(
      MAX_NEW_NULLIFIERS_PER_TX,
      endNonRevertibleData.newNullifiers,
      end.newNullifiers,
    );

    const nullifierReadRequestHints = await this.hintsBuilder.getNullifierReadRequestHints(
      validationRequests.nullifierReadRequests,
      pendingNullifiers,
    );

    const nullifierNonExistentReadRequestHints = await this.hintsBuilder.getNullifierNonExistentReadRequestHints(
      validationRequests.nullifierNonExistentReadRequests,
      pendingNullifiers,
    );

    const pendingPublicDataWrites = mergeAccumulatedData(
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      endNonRevertibleData.publicDataUpdateRequests,
      end.publicDataUpdateRequests,
    );

    const publicDataHints = await this.hintsBuilder.getPublicDataHints(
      validationRequests.publicDataReads,
      pendingPublicDataWrites,
    );

    const publicDataReadRequestHints = this.hintsBuilder.getPublicDataReadRequestHints(
      validationRequests.publicDataReads,
      pendingPublicDataWrites,
      publicDataHints,
    );

    const currentState = await this.db.getStateReference();

    return new PublicKernelTailCircuitPrivateInputs(
      previousKernel,
      nullifierReadRequestHints,
      nullifierNonExistentReadRequestHints,
      publicDataHints,
      publicDataReadRequestHints,
      currentState.partial,
    );
  }

  private sortNoteHashes<N extends number>(noteHashes: Tuple<SideEffect, N>): Tuple<Fr, N> {
    return sortByCounter(noteHashes.map(n => ({ ...n, counter: n.counter.toNumber() }))).map(n => n.value) as Tuple<
      Fr,
      N
    >;
  }
}
