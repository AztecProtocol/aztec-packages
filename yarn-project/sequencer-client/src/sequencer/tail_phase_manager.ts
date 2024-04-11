import { UnencryptedL2Log, Tx, UnencryptedFunctionL2Logs } from '@aztec/circuit-types';
import {
  Fr,
  type GlobalVariables,
  type Header,
  type KernelCircuitPublicInputs,
  MAX_NEW_NOTE_HASHES_PER_TX,
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

import { type PublicKernelCircuitSimulator } from '../simulator/index.js';
import { type ContractsDataSourcePublicDB } from '../simulator/public_executor.js';
import { AbstractPhaseManager, PublicKernelPhase } from './abstract_phase_manager.js';

export class TailPhaseManager extends AbstractPhaseManager {
  constructor(
    protected db: MerkleTreeOperations,
    protected publicExecutor: PublicExecutor,
    protected publicKernel: PublicKernelCircuitSimulator,
    protected globalVariables: GlobalVariables,
    protected historicalHeader: Header,
    protected publicContractsDB: ContractsDataSourcePublicDB,
    protected publicStateDB: PublicStateDB,
    public readonly phase: PublicKernelPhase = PublicKernelPhase.TAIL,
  ) {
    super(db, publicExecutor, publicKernel, globalVariables, historicalHeader, phase);
  }

  async handle(tx: Tx, previousPublicKernelOutput: PublicKernelCircuitPublicInputs, previousPublicKernelProof: Proof) {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);
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
    // Temporary hack. Should sort them in the tail circuit.
    this.patchLogsOrdering(tx, previousPublicKernelOutput);
    // commit the state updates from this transaction
    await this.publicStateDB.commit();

    return {
      publicKernelOutput: previousPublicKernelOutput,
      finalKernelOutput,
      publicKernelProof,
      revertReason: undefined,
      returnValues: undefined,
    };
  }

  private async runTailKernelCircuit(
    previousOutput: PublicKernelCircuitPublicInputs,
    previousProof: Proof,
  ): Promise<[KernelCircuitPublicInputs, Proof]> {
    const output = await this.simulate(previousOutput, previousProof);

    // Temporary hack. Should sort them in the tail circuit.
    const noteHashes = mergeAccumulatedData(
      MAX_NEW_NOTE_HASHES_PER_TX,
      previousOutput.endNonRevertibleData.newNoteHashes,
      previousOutput.end.newNoteHashes,
    );
    output.end.newNoteHashes = this.sortNoteHashes<typeof MAX_NEW_NOTE_HASHES_PER_TX>(noteHashes);

    return [output, makeEmptyProof()];
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

private sortNoteHashes<N extends number>(noteHashes: Tuple<SideEffect, N>): Tuple<Fr, N> {
  return sortByCounter(noteHashes.map(n => ({ ...n, counter: n.counter.toNumber() }))).map(n => n.value) as Tuple<
    Fr,
    N
  >;
}

  // As above, this is a hack for unencrypted logs ordering, now they are sorted. Since the public kernel
  // cannot keep track of side effects that happen after or before a nested call, we override the gathered logs.
  // As a sanity check, we at least verify that the elements are the same, so we are only tweaking their ordering.
  // See same fn in pxe_service.ts
  // Added as part of resolving #5017
  private patchLogsOrdering(
    tx: Tx, publicInputs: PublicKernelCircuitPublicInputs,
  ) {
    const unencLogs = tx.unencryptedLogs.unrollLogs();
    const sortedUnencLogs = publicInputs.end.unencryptedLogsHashes;

    let finalUnencLogs: UnencryptedL2Log[] = [];
    sortedUnencLogs.forEach((sideEffect: SideEffect) => {
      if (!sideEffect.isEmpty()) {
        const isLog = (log: UnencryptedL2Log ) => Fr.fromBuffer(log.hash()).equals(sideEffect.value);
        const thisLogIndex = unencLogs.findIndex(isLog);
        finalUnencLogs.push(unencLogs[thisLogIndex]);
      }
    });
    const unencryptedLogs = new UnencryptedFunctionL2Logs(finalUnencLogs);

    tx.unencryptedLogs.functionLogs[0] = unencryptedLogs;
    for (let i = 1; i < tx.unencryptedLogs.functionLogs.length; i++) {
      tx.unencryptedLogs.functionLogs[i] = UnencryptedFunctionL2Logs.empty();
    }
  }
}
