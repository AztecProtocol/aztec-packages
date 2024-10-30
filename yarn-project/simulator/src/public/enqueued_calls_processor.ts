import {
  type AvmProvingRequest,
  type MerkleTreeReadOperations,
  type NestedProcessReturnValues,
  type ProcessedTx,
  type PublicExecutionRequest,
  PublicKernelPhase,
  type SimulationError,
  type Tx,
} from '@aztec/circuit-types';
import {
  EnqueuedCallData,
  Fr,
  Gas,
  type GlobalVariables,
  type Header,
  type KernelCircuitPublicInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  PublicAccumulatedDataArrayLengths,
  type PublicCallRequest,
  PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  PublicKernelData,
  PublicValidationRequestArrayLengths,
  type VMCircuitPublicInputs,
  VerificationKeyData,
  makeEmptyProof,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';

import { inspect } from 'util';

import { AvmPersistableStateManager } from '../avm/journal/journal.js';
import { DualSideEffectTrace } from './dual_side_effect_trace.js';
import { PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { EnqueuedCallSimulator } from './enqueued_call_simulator.js';
import { type PublicExecutor } from './executor.js';
import { type WorldStateDB } from './public_db_sources.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';
import { PublicKernelTailSimulator } from './public_kernel_tail_simulator.js';
import { PublicSideEffectTrace } from './side_effect_trace.js';

const PhaseIsRevertible: Record<PublicKernelPhase, boolean> = {
  [PublicKernelPhase.SETUP]: false,
  [PublicKernelPhase.APP_LOGIC]: true,
  [PublicKernelPhase.TEARDOWN]: true,
};

type PublicPhaseResult = {
  avmProvingRequest: AvmProvingRequest;
  /** The output of the public kernel circuit simulation for this phase */
  publicKernelOutput: PublicKernelCircuitPublicInputs;
  /** Return values of simulating complete callstack */
  returnValues: NestedProcessReturnValues[];
  /** Gas used during the execution this phase */
  gasUsed: Gas;
  /** Time spent for the execution this phase */
  durationMs: number;
  /** Revert reason, if any */
  revertReason?: SimulationError;
};

export type ProcessedPhase = {
  phase: PublicKernelPhase;
  durationMs: number;
  revertReason?: SimulationError;
};

export type TxPublicCallsResult = {
  avmProvingRequest: AvmProvingRequest;
  /** The output of the public kernel tail circuit simulation for this tx */
  tailKernelOutput: KernelCircuitPublicInputs;
  /** Return values of simulating complete callstack */
  returnValues: NestedProcessReturnValues[];
  /** Gas used during the execution this tx */
  gasUsed: ProcessedTx['gasUsed'];
  /** Revert reason, if any */
  revertReason?: SimulationError;
  processedPhases: ProcessedPhase[];
};

export class EnqueuedCallsProcessor {
  private log: DebugLogger;

  constructor(
    private publicKernelSimulator: PublicKernelCircuitSimulator,
    private globalVariables: GlobalVariables,
    private worldStateDB: WorldStateDB,
    private enqueuedCallSimulator: EnqueuedCallSimulator,
    private publicKernelTailSimulator: PublicKernelTailSimulator,
  ) {
    this.log = createDebugLogger(`aztec:sequencer`);
  }

  static create(
    db: MerkleTreeReadOperations,
    publicExecutor: PublicExecutor,
    publicKernelSimulator: PublicKernelCircuitSimulator,
    globalVariables: GlobalVariables,
    historicalHeader: Header,
    worldStateDB: WorldStateDB,
  ) {
    const enqueuedCallSimulator = new EnqueuedCallSimulator(db, publicExecutor, globalVariables, historicalHeader);

    const publicKernelTailSimulator = PublicKernelTailSimulator.create(db, publicKernelSimulator);

    return new EnqueuedCallsProcessor(
      publicKernelSimulator,
      globalVariables,
      worldStateDB,
      enqueuedCallSimulator,
      publicKernelTailSimulator,
    );
  }

  static getExecutionRequestsByPhase(tx: Tx, phase: PublicKernelPhase): PublicExecutionRequest[] {
    switch (phase) {
      case PublicKernelPhase.SETUP:
        return tx.getNonRevertiblePublicExecutionRequests();
      case PublicKernelPhase.APP_LOGIC:
        return tx.getRevertiblePublicExecutionRequests();
      case PublicKernelPhase.TEARDOWN: {
        const request = tx.getPublicTeardownExecutionRequest();
        return request ? [request] : [];
      }
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  static getCallRequestsByPhase(tx: Tx, phase: PublicKernelPhase): PublicCallRequest[] {
    switch (phase) {
      case PublicKernelPhase.SETUP:
        return tx.data.getNonRevertiblePublicCallRequests();
      case PublicKernelPhase.APP_LOGIC:
        return tx.data.getRevertiblePublicCallRequests();
      case PublicKernelPhase.TEARDOWN: {
        const request = tx.data.getTeardownPublicCallRequest();
        return request ? [request] : [];
      }
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  async process(tx: Tx): Promise<TxPublicCallsResult> {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);

    const phases: PublicKernelPhase[] = [
      PublicKernelPhase.SETUP,
      PublicKernelPhase.APP_LOGIC,
      PublicKernelPhase.TEARDOWN,
    ];
    const processedPhases: ProcessedPhase[] = [];
    const gasUsed: ProcessedTx['gasUsed'] = {};
    let avmProvingRequest: AvmProvingRequest;
    let publicKernelOutput = tx.data.toPublicKernelCircuitPublicInputs();
    let isFromPrivate = true;
    let returnValues: NestedProcessReturnValues[] = [];
    let revertReason: SimulationError | undefined;

    // TODO(dbanks12): need to emit TX nullifier if there was no private execution?
    // Dow we also need to check its existence?
    const pendingNullifiers = [
      ...publicKernelOutput.end.nullifiers,
      ...publicKernelOutput.endNonRevertibleData.nullifiers,
    ]
      .filter(n => !n.isEmpty())
      .map(n => n.value);
    // TODO(dbanks12): cleanup
    const prevAccumulatedData =
      //phase === PublicKernelPhase.SETUP ?
      publicKernelOutput.endNonRevertibleData;
    //: publicKernelOutput.end;
    const previousValidationRequestArrayLengths = PublicValidationRequestArrayLengths.new(
      publicKernelOutput.validationRequests,
    );

    const previousAccumulatedDataArrayLengths = PublicAccumulatedDataArrayLengths.new(prevAccumulatedData);
    // TODO(dbanks12): if an enqueued call has startSideEffectCounter == endSideEffectCounter,
    // then we need to make sure to increment on the next fork
    const innerCallTrace = new PublicSideEffectTrace(1);
    const enqueuedCallTrace = new PublicEnqueuedCallSideEffectTrace(
      /*startSideEffectCounter=*/ 1,
      previousValidationRequestArrayLengths,
      previousAccumulatedDataArrayLengths,
    );
    const trace = new DualSideEffectTrace(innerCallTrace, enqueuedCallTrace);
    // TODO(dbanks12): do we need to pass pending note hashes, messages, logs here too?
    //
    // Right now we are creating one top level state manager,
    // and then forking it per enqueued call.
    //
    // We want to store a checkpoint at the start of app logic that
    // is rolled back to if any enqaueued call in app logic reverts.
    const txStateManager = AvmPersistableStateManager.newWithPendingSiloedNullifiers(
      this.worldStateDB,
      trace,
      pendingNullifiers,
    );
    for (let i = 0; i < phases.length; i++) {
      // TODO(dbanks12): cleanup
      const phase = phases[i];
      // If in app logic, fork the state so that if ANY app-logic enqueued call reverts,
      // we can rollback to the start of app logic.
      // This effectively snapshots the state at the end of setup (start of app-logic)
      // so that we can rollback to it before teardown if app-logic reverts.
      // NOTE: should actually be able to fork for entire revertible section (app + teardown), but
      // then we need to call `processEntireAppLogicPhase` with all callRequests & executionRequests
      // across both of those phases.
      //const stateManagerForPhase = phase === PublicKernelPhase.SETUP ? txStateManager : txStateManager.fork();
      // Teardown is revertible, but will run even if app logic reverts!
      this.log.debug(`start of phase, end counter from previousKernel: ${publicKernelOutput.endSideEffectCounter}`);
      const stateManagerForPhase = phase !== PublicKernelPhase.SETUP ? txStateManager.fork() : txStateManager;
      const callRequests = EnqueuedCallsProcessor.getCallRequestsByPhase(tx, phase);
      if (callRequests.length) {
        const executionRequests = EnqueuedCallsProcessor.getExecutionRequestsByPhase(tx, phase);
        const result = await this.processPhase(
          tx,
          callRequests,
          executionRequests,
          publicKernelOutput,
          phase,
          isFromPrivate,
          stateManagerForPhase,
        ).catch(async err => {
          await this.worldStateDB.rollbackToCommit();
          throw err;
        });

        publicKernelOutput = result.publicKernelOutput;
        isFromPrivate = false;

        // Propagate only one avmProvingRequest of a function call for now, so that we know it's still provable.
        // Eventually this will be the proof for the entire public call stack.
        avmProvingRequest = result.avmProvingRequest;

        if (phase === PublicKernelPhase.APP_LOGIC) {
          returnValues = result.returnValues;
        }

        if (phase !== PublicKernelPhase.SETUP) {
          // TODO(dbanks12): do we need to do this if we already did this for each enqueued call fork?
          txStateManager.processEntireAppLogicPhase(
            stateManagerForPhase,
            callRequests,
            executionRequests.map(req => req.args),
            /*reverted=*/ result.revertReason ? true : false,
          );
        }

        gasUsed[phase] = result.gasUsed;

        processedPhases.push({
          phase,
          durationMs: result.durationMs,
          revertReason: result.revertReason,
        });

        revertReason ??= result.revertReason;
      }
      let j = 0;
      for (const req of enqueuedCallTrace.getSideEffects().contractStorageUpdateRequests) {
        this.log.debug(`Storage update request ${j++}: ${JSON.stringify(req)}`);
      }
    }

    const tailKernelOutput = await this.publicKernelTailSimulator.simulate(publicKernelOutput).catch(
      // the abstract phase manager throws if simulation gives error in non-revertible phase
      async err => {
        await this.worldStateDB.rollbackToCommit();
        throw err;
      },
    );

    return {
      avmProvingRequest: avmProvingRequest!,
      tailKernelOutput,
      returnValues,
      gasUsed,
      processedPhases,
      revertReason,
    };
  }

  private async processPhase(
    tx: Tx,
    callRequests: PublicCallRequest[],
    executionRequests: PublicExecutionRequest[],
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    phase: PublicKernelPhase,
    isFromPrivate: boolean,
    txStateManager: AvmPersistableStateManager,
  ): Promise<PublicPhaseResult> {
    this.log.debug(`Beginning processing in phase ${PublicKernelPhase[phase]} for tx ${tx.getTxHash()}`);

    const phaseTimer = new Timer();
    const returnValues: NestedProcessReturnValues[] = [];
    let avmProvingRequest: AvmProvingRequest;
    let publicKernelOutput = previousPublicKernelOutput;
    let gasUsed = Gas.empty();
    let revertReason: SimulationError | undefined;
    for (let i = callRequests.length - 1; i >= 0 && !revertReason; i--) {
      const callRequest = callRequests[i];
      const executionRequest = executionRequests[i];

      // add new contracts to the contracts db so that their functions may be found and called
      // TODO(#4073): This is catching only private deployments, when we add public ones, we'll
      // have to capture contracts emitted in that phase as well.
      // TODO(@spalladino): Should we allow emitting contracts in the fee preparation phase?
      // TODO(#6464): Should we allow emitting contracts in the private setup phase?
      // if so, this should only add contracts that were deployed during private app logic.
      await this.worldStateDB.addNewContracts(tx);

      const availableGas = this.getAvailableGas(tx, publicKernelOutput, phase);
      const transactionFee = this.getTransactionFee(tx, publicKernelOutput, phase);

      // each enqueued call starts with an incremented side effect counter
      const enqueuedCallStateManager = txStateManager.fork(/*incrementSideEffectCounter=*/ true);
      const enqueuedCallResult = await this.enqueuedCallSimulator.simulate(
        callRequest,
        executionRequest,
        publicKernelOutput,
        availableGas,
        transactionFee,
        phase,
        enqueuedCallStateManager,
      );

      if (enqueuedCallResult.revertReason && !PhaseIsRevertible[phase]) {
        this.log.debug(
          `Simulation error on ${executionRequest.callContext.contractAddress}:${executionRequest.callContext.functionSelector} with reason: ${enqueuedCallResult.revertReason}`,
        );
        throw enqueuedCallResult.revertReason;
      }
      await txStateManager.processEnqueuedCall(
        enqueuedCallStateManager,
        callRequest,
        executionRequest.args,
        enqueuedCallResult.reverted!,
      );

      avmProvingRequest = enqueuedCallResult.avmProvingRequest;
      returnValues.push(enqueuedCallResult.returnValues);
      gasUsed = gasUsed.add(enqueuedCallResult.gasUsed);
      revertReason ??= enqueuedCallResult.revertReason;

      // Instead of operating on worldStateDB here, do we do AvmPersistableStateManager.revert() or return()?
      if (revertReason) {
        // TODO(#6464): Should we allow emitting contracts in the private setup phase?
        // if so, this is removing contracts deployed in private setup
        // You can't submit contracts in public, so this is only relevant for private-created
        // side effects
        // Are we reverting here back to end of non-revertible insertions?
        // What are we reverting back to?
        await this.worldStateDB.removeNewContracts(tx);
        //await this.worldStateDB.rollbackToCheckpoint();
        // TODO(dbanks12): shouldn't be necessary since side effect trace should handle this
        tx.filterRevertedLogs(publicKernelOutput);
      } else {
        // TODO(#6470): we should be adding contracts deployed in those logs to the publicContractsDB
        // TODO(dbanks12): shouldn't be necessary since side effect trace should handle this
        tx.unencryptedLogs.addFunctionLogs([enqueuedCallResult.newUnencryptedLogs]);
      }

      const output = await this.runMergeKernelCircuit(
        publicKernelOutput,
        enqueuedCallResult.kernelOutput,
        isFromPrivate,
      );
      publicKernelOutput = output;
      isFromPrivate = false;
    }

    //if (phase === PublicKernelPhase.SETUP) {
    //  await this.worldStateDB.checkpoint();
    //}

    return {
      avmProvingRequest: avmProvingRequest!,
      publicKernelOutput,
      durationMs: phaseTimer.ms(),
      gasUsed,
      returnValues: revertReason ? [] : returnValues,
      revertReason,
    };
  }

  private getAvailableGas(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    phase: PublicKernelPhase,
  ) {
    if (phase === PublicKernelPhase.TEARDOWN) {
      return tx.data.constants.txContext.gasSettings.getTeardownLimits();
    } else {
      return tx.data.constants.txContext.gasSettings
        .getLimits() // No need to subtract teardown limits since they are already included in end.gasUsed
        .sub(previousPublicKernelOutput.end.gasUsed)
        .sub(previousPublicKernelOutput.endNonRevertibleData.gasUsed);
    }
  }

  private getTransactionFee(
    tx: Tx,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    phase: PublicKernelPhase,
  ): Fr {
    if (phase !== PublicKernelPhase.TEARDOWN) {
      return Fr.ZERO;
    } else {
      const gasSettings = tx.data.constants.txContext.gasSettings;
      const gasFees = this.globalVariables.gasFees;
      // No need to add teardown limits since they are already included in end.gasUsed
      const gasUsed = previousPublicKernelOutput.end.gasUsed.add(
        previousPublicKernelOutput.endNonRevertibleData.gasUsed,
      );
      const txFee = gasSettings.inclusionFee.add(gasUsed.computeFee(gasFees));
      this.log.debug(`Computed tx fee`, { txFee, gasUsed: inspect(gasUsed), gasFees: inspect(gasFees) });
      return txFee;
    }
  }

  private async runMergeKernelCircuit(
    previousOutput: PublicKernelCircuitPublicInputs,
    enqueuedCallData: VMCircuitPublicInputs,
    isFromPrivate: boolean,
  ): Promise<PublicKernelCircuitPublicInputs> {
    const previousKernel = this.getPreviousKernelData(previousOutput, isFromPrivate);

    // The proof is not used in simulation.
    const vmProof = makeEmptyProof();
    const callData = new EnqueuedCallData(enqueuedCallData, vmProof);

    const inputs = new PublicKernelCircuitPrivateInputs(previousKernel, callData);

    this.log.debug(`previousKernel end counter: ${previousKernel.publicInputs.endSideEffectCounter}`);
    this.log.debug(`enqueued call start counter: ${enqueuedCallData.startSideEffectCounter}`);
    return await this.publicKernelSimulator.publicKernelCircuitMerge(inputs);
  }

  private getPreviousKernelData(
    previousOutput: PublicKernelCircuitPublicInputs,
    _isFromPrivate: boolean,
  ): PublicKernelData {
    // The proof is not used in simulation.
    const proof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);

    const vk = VerificationKeyData.makeFakeHonk();
    const vkIndex = 0;
    const siblingPath = getVKSiblingPath(vkIndex);

    return new PublicKernelData(previousOutput, proof, vk, vkIndex, siblingPath);
  }
}
