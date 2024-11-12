import {
  type AvmProvingRequest,
  type GasUsed,
  type MerkleTreeReadOperations,
  type NestedProcessReturnValues,
  type PublicExecutionRequest,
  type SimulationError,
  type Tx,
  TxExecutionPhase,
} from '@aztec/circuit-types';
import {
  AvmAccumulatedData,
  AvmCircuitPublicInputs,
  type CombinedAccumulatedData,
  CombinedConstantData,
  EnqueuedCallData,
  Fr,
  Gas,
  type GlobalVariables,
  type Header,
  type KernelCircuitPublicInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  PublicAccumulatedData,
  PublicAccumulatedDataArrayLengths,
  type PublicCallRequest,
  PublicKernelCircuitPrivateInputs,
  PublicKernelCircuitPublicInputs,
  PublicKernelData,
  PublicValidationRequestArrayLengths,
  PublicValidationRequests,
  RevertCode,
  TreeSnapshots,
  type VMCircuitPublicInputs,
  VerificationKeyData,
  countAccumulatedItems,
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

const PhaseIsRevertible: Record<TxExecutionPhase, boolean> = {
  [TxExecutionPhase.SETUP]: false,
  [TxExecutionPhase.APP_LOGIC]: true,
  [TxExecutionPhase.TEARDOWN]: true,
};

type PublicPhaseResult = {
  avmProvingRequest: AvmProvingRequest;
  /** The output of the public kernel circuit simulation for this phase */
  publicKernelOutput: PublicKernelCircuitPublicInputs;
  /** Return values of simulating complete callstack */
  returnValues: NestedProcessReturnValues[];
  /** Gas used during the execution of this phase */
  gasUsed: Gas;
  /** Time spent for the execution this phase */
  durationMs: number;
  /** Reverted */
  reverted: boolean;
  /** Revert reason, if any */
  revertReason?: SimulationError;
};

type PhaseGasUsed = Record<TxExecutionPhase, Gas>;

export type ProcessedPhase = {
  phase: TxExecutionPhase;
  durationMs: number;
  returnValues: NestedProcessReturnValues[];
  revertReason?: SimulationError;
};

export type TxPublicCallsResult = {
  avmProvingRequest: AvmProvingRequest;
  /** Gas used during the execution of this tx */
  gasUsed: GasUsed;
  revertCode: RevertCode;
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
    realAvmProvingRequests: boolean = true,
  ) {
    const enqueuedCallSimulator = new EnqueuedCallSimulator(
      db,
      worldStateDB,
      publicExecutor,
      globalVariables,
      historicalHeader,
      realAvmProvingRequests,
    );

    const publicKernelTailSimulator = PublicKernelTailSimulator.create(db, publicKernelSimulator);

    return new EnqueuedCallsProcessor(
      publicKernelSimulator,
      globalVariables,
      worldStateDB,
      enqueuedCallSimulator,
      publicKernelTailSimulator,
    );
  }

  static getExecutionRequestsByPhase(tx: Tx, phase: TxExecutionPhase): PublicExecutionRequest[] {
    switch (phase) {
      case TxExecutionPhase.SETUP:
        return tx.getNonRevertiblePublicExecutionRequests();
      case TxExecutionPhase.APP_LOGIC:
        return tx.getRevertiblePublicExecutionRequests();
      case TxExecutionPhase.TEARDOWN: {
        const request = tx.getPublicTeardownExecutionRequest();
        return request ? [request] : [];
      }
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  static getCallRequestsByPhase(tx: Tx, phase: TxExecutionPhase): PublicCallRequest[] {
    switch (phase) {
      case TxExecutionPhase.SETUP:
        return tx.data.getNonRevertiblePublicCallRequests();
      case TxExecutionPhase.APP_LOGIC:
        return tx.data.getRevertiblePublicCallRequests();
      case TxExecutionPhase.TEARDOWN: {
        const request = tx.data.getTeardownPublicCallRequest();
        return request ? [request] : [];
      }
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  async process(tx: Tx): Promise<TxPublicCallsResult> {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);

    const constants = CombinedConstantData.combine(tx.data.constants, this.globalVariables);
    const phases: TxExecutionPhase[] = [TxExecutionPhase.SETUP, TxExecutionPhase.APP_LOGIC, TxExecutionPhase.TEARDOWN];
    const processedPhases: ProcessedPhase[] = [];
    let phaseGasUsed: PhaseGasUsed = {
      [TxExecutionPhase.SETUP]: Gas.empty(),
      [TxExecutionPhase.APP_LOGIC]: Gas.empty(),
      [TxExecutionPhase.TEARDOWN]: Gas.empty(),
    };
    let avmProvingRequest: AvmProvingRequest;
    let publicKernelOutput = this.getPublicKernelCircuitPublicInputs(tx.data);
    let revertReason: SimulationError | undefined;

    const nonRevertibleNullifiersFromPrivate = publicKernelOutput.endNonRevertibleData.nullifiers
      .filter(n => !n.isEmpty())
      .map(n => n.value);
    const _revertibleNullifiersFromPrivate = publicKernelOutput.end.nullifiers
      .filter(n => !n.isEmpty())
      .map(n => n.value);

    // During SETUP, non revertible side effects from private are our "previous data"
    const prevAccumulatedData = publicKernelOutput.endNonRevertibleData;
    const previousValidationRequestArrayLengths = PublicValidationRequestArrayLengths.new(
      publicKernelOutput.validationRequests,
    );

    const previousAccumulatedDataArrayLengths = PublicAccumulatedDataArrayLengths.new(prevAccumulatedData);
    const innerCallTrace = new PublicSideEffectTrace();
    const enqueuedCallTrace = new PublicEnqueuedCallSideEffectTrace(
      /*startSideEffectCounter=*/ 0,
      previousValidationRequestArrayLengths,
      previousAccumulatedDataArrayLengths,
    );
    const trace = new DualSideEffectTrace(innerCallTrace, enqueuedCallTrace);

    // Transaction level state manager that will be forked for revertible phases.
    const txStateManager = AvmPersistableStateManager.newWithPendingSiloedNullifiers(
      this.worldStateDB,
      trace,
      nonRevertibleNullifiersFromPrivate,
    );
    // TODO(dbanks12): insert all non-revertible side effects from private here.

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      let stateManagerForPhase: AvmPersistableStateManager;
      if (phase === TxExecutionPhase.SETUP) {
        // don't need to fork for setup since it's non-revertible
        // (if setup fails, transaction is thrown out)
        stateManagerForPhase = txStateManager;
      } else {
        // Fork the state manager so that we can rollback state if a revertible phase reverts.
        stateManagerForPhase = txStateManager.fork();
        // NOTE: Teardown is revertible, but will run even if app logic reverts!
      }
      const callRequests = EnqueuedCallsProcessor.getCallRequestsByPhase(tx, phase);
      if (callRequests.length) {
        const allocatedGas = this.getAllocatedGasForPhase(phase, tx, phaseGasUsed);
        const transactionFee = phase !== TxExecutionPhase.TEARDOWN ? Fr.ZERO : this.getTransactionFee(tx, phaseGasUsed);

        const executionRequests = EnqueuedCallsProcessor.getExecutionRequestsByPhase(tx, phase);
        const result = await this.processPhase(
          phase,
          tx,
          constants,
          callRequests,
          executionRequests,
          publicKernelOutput,
          allocatedGas,
          transactionFee,
          stateManagerForPhase,
        ).catch(async err => {
          await this.worldStateDB.rollbackToCommit();
          throw err;
        });

        publicKernelOutput = result.publicKernelOutput;

        // Propagate only one avmProvingRequest of a function call for now, so that we know it's still provable.
        // Eventually this will be the proof for the entire public call stack.
        avmProvingRequest = result.avmProvingRequest;

        if (phase !== TxExecutionPhase.SETUP) {
          txStateManager.mergeStateForPhase(
            stateManagerForPhase,
            callRequests,
            executionRequests.map(req => req.args),
            /*reverted=*/ result.revertReason ? true : false,
          );
        }

        processedPhases.push({
          phase,
          durationMs: result.durationMs,
          returnValues: result.returnValues,
          revertReason: result.revertReason,
        });

        phaseGasUsed = {
          ...phaseGasUsed,
          [phase]: result.gasUsed,
        };

        revertReason ??= result.revertReason;
      }
    }

    const tailKernelOutput = await this.publicKernelTailSimulator.simulate(publicKernelOutput).catch(
      // the abstract phase manager throws if simulation gives error in non-revertible phase
      async err => {
        await this.worldStateDB.rollbackToCommit();
        throw err;
      },
    );

    const transactionFee = this.getTransactionFee(tx, phaseGasUsed);
    avmProvingRequest!.inputs.output = this.generateAvmCircuitPublicInputs(tx, tailKernelOutput, transactionFee);

    const gasUsed = {
      totalGas: this.getActualGasUsed(tx, phaseGasUsed),
      teardownGas: phaseGasUsed[TxExecutionPhase.TEARDOWN],
    };

    return {
      avmProvingRequest: avmProvingRequest!,
      gasUsed,
      processedPhases,
      revertCode: tailKernelOutput.revertCode,
      revertReason,
    };
  }

  private async processPhase(
    phase: TxExecutionPhase,
    tx: Tx,
    constants: CombinedConstantData,
    callRequests: PublicCallRequest[],
    executionRequests: PublicExecutionRequest[],
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    allocatedGas: Gas,
    transactionFee: Fr,
    txStateManager: AvmPersistableStateManager,
  ): Promise<PublicPhaseResult> {
    this.log.debug(`Beginning processing in phase ${TxExecutionPhase[phase]} for tx ${tx.getTxHash()}`);

    const phaseTimer = new Timer();
    const returnValues: NestedProcessReturnValues[] = [];
    let availableGas = allocatedGas;
    let avmProvingRequest: AvmProvingRequest;
    let publicKernelOutput = previousPublicKernelOutput;
    let reverted: boolean = false;
    let revertReason: SimulationError | undefined;
    for (let i = callRequests.length - 1; i >= 0; i--) {
      if (reverted) {
        break;
      }

      const callRequest = callRequests[i];
      const executionRequest = executionRequests[i];

      // add new contracts to the contracts db so that their functions may be found and called
      // TODO(#4073): This is catching only private deployments, when we add public ones, we'll
      // have to capture contracts emitted in that phase as well.
      // TODO(@spalladino): Should we allow emitting contracts in the fee preparation phase?
      // TODO(#6464): Should we allow emitting contracts in the private setup phase?
      // if so, this should only add contracts that were deployed during private app logic.
      await this.worldStateDB.addNewContracts(tx);

      // each enqueued call starts with an incremented side effect counter
      const enqueuedCallStateManager = txStateManager.fork(/*incrementSideEffectCounter=*/ true);
      const enqueuedCallResult = await this.enqueuedCallSimulator.simulate(
        callRequest,
        executionRequest,
        constants,
        availableGas,
        transactionFee,
        enqueuedCallStateManager,
      );

      if (enqueuedCallResult.revertReason && !PhaseIsRevertible[phase]) {
        this.log.debug(
          `Simulation error on ${executionRequest.callContext.contractAddress}:${executionRequest.callContext.functionSelector} with reason: ${enqueuedCallResult.revertReason}`,
        );
        throw enqueuedCallResult.revertReason;
      }
      await txStateManager.mergeStateForEnqueuedCall(
        enqueuedCallStateManager,
        callRequest,
        executionRequest.args,
        enqueuedCallResult.reverted!,
      );

      availableGas = availableGas.sub(enqueuedCallResult.gasUsed);
      avmProvingRequest = enqueuedCallResult.avmProvingRequest;
      returnValues.push(enqueuedCallResult.returnValues);
      reverted = enqueuedCallResult.reverted;
      revertReason = enqueuedCallResult.revertReason;

      // Instead of operating on worldStateDB here, do we do AvmPersistableStateManager.revert() or return()?
      if (reverted) {
        // TODO(#6464): Should we allow emitting contracts in the private setup phase?
        // if so, this is removing contracts deployed in private setup
        // You can't submit contracts in public, so this is only relevant for private-created
        // side effects
        // Are we reverting here back to end of non-revertible insertions?
        // What are we reverting back to?
        await this.worldStateDB.removeNewContracts(tx);
        tx.filterRevertedLogs(publicKernelOutput);
      } else {
        tx.unencryptedLogs.addFunctionLogs([enqueuedCallResult.newUnencryptedLogs]);
      }

      const output = await this.runMergeKernelCircuit(publicKernelOutput, enqueuedCallResult.kernelOutput);
      publicKernelOutput = output;
    }

    return {
      avmProvingRequest: avmProvingRequest!,
      publicKernelOutput,
      durationMs: phaseTimer.ms(),
      gasUsed: allocatedGas.sub(availableGas),
      returnValues,
      reverted,
      revertReason,
    };
  }

  private getAllocatedGasForPhase(phase: TxExecutionPhase, tx: Tx, phaseGasUsed: PhaseGasUsed) {
    const gasSettings = tx.data.constants.txContext.gasSettings;
    if (phase === TxExecutionPhase.TEARDOWN) {
      return gasSettings.teardownGasLimits;
    } else {
      return gasSettings.gasLimits
        .sub(tx.data.gasUsed)
        .sub(phaseGasUsed[TxExecutionPhase.SETUP])
        .sub(phaseGasUsed[TxExecutionPhase.APP_LOGIC]);
    }
  }

  private getTransactionFee(tx: Tx, phaseGasUsed: PhaseGasUsed): Fr {
    const gasFees = this.globalVariables.gasFees;
    const txFee = tx.data.gasUsed // This should've included teardown gas limits.
      .add(phaseGasUsed[TxExecutionPhase.SETUP])
      .add(phaseGasUsed[TxExecutionPhase.APP_LOGIC])
      .computeFee(gasFees);

    this.log.debug(`Computed tx fee`, { txFee, gasUsed: inspect(phaseGasUsed), gasFees: inspect(gasFees) });

    return txFee;
  }

  private getActualGasUsed(tx: Tx, phaseGasUsed: PhaseGasUsed) {
    const requireTeardown = tx.data.hasTeardownPublicCallRequest();
    const teardownGasLimits = tx.data.constants.txContext.gasSettings.teardownGasLimits;
    const privateGasUsed = tx.data.gasUsed.sub(requireTeardown ? teardownGasLimits : Gas.empty());
    const publicGasUsed = Object.values(phaseGasUsed).reduce((accum, gasUsed) => accum.add(gasUsed), Gas.empty());
    return privateGasUsed.add(publicGasUsed);
  }

  private async runMergeKernelCircuit(
    previousOutput: PublicKernelCircuitPublicInputs,
    enqueuedCallData: VMCircuitPublicInputs,
  ): Promise<PublicKernelCircuitPublicInputs> {
    const previousKernel = this.getPreviousKernelData(previousOutput);

    // The proof is not used in simulation.
    const vmProof = makeEmptyProof();
    const callData = new EnqueuedCallData(enqueuedCallData, vmProof);

    const inputs = new PublicKernelCircuitPrivateInputs(previousKernel, callData);

    return await this.publicKernelSimulator.publicKernelCircuitMerge(inputs);
  }

  private getPreviousKernelData(previousOutput: PublicKernelCircuitPublicInputs): PublicKernelData {
    // The proof is not used in simulation.
    const proof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);

    const vk = VerificationKeyData.makeFakeHonk();
    const vkIndex = 0;
    const siblingPath = getVKSiblingPath(vkIndex);

    return new PublicKernelData(previousOutput, proof, vk, vkIndex, siblingPath);
  }

  // Temporary hack to create PublicKernelCircuitPublicInputs from PrivateKernelTailCircuitPublicInputs.
  private getPublicKernelCircuitPublicInputs(data: PrivateKernelTailCircuitPublicInputs) {
    const constants = CombinedConstantData.combine(data.constants, this.globalVariables);

    const validationRequest = PublicValidationRequests.empty();
    validationRequest.forRollup = data.rollupValidationRequests;

    const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) => {
      const to = PublicAccumulatedData.empty();
      to.noteHashes.forEach((_, i) => (to.noteHashes[i].noteHash.value = from.noteHashes[i]));
      to.nullifiers.forEach((_, i) => (to.nullifiers[i].value = from.nullifiers[i]));
      to.l2ToL1Msgs.forEach((_, i) => (to.l2ToL1Msgs[i] = from.l2ToL1Msgs[i]));
      to.noteEncryptedLogsHashes.forEach((_, i) => (to.noteEncryptedLogsHashes[i] = from.noteEncryptedLogsHashes[i]));
      to.encryptedLogsHashes.forEach((_, i) => (to.encryptedLogsHashes[i] = from.encryptedLogsHashes[i]));
      to.unencryptedLogsHashes.forEach((_, i) => (to.unencryptedLogsHashes[i] = from.unencryptedLogsHashes[i]));
      to.publicCallStack.forEach((_, i) => (to.publicCallStack[i] = from.publicCallRequests[i]));
      return to;
    };

    return new PublicKernelCircuitPublicInputs(
      constants,
      validationRequest,
      convertAccumulatedData(data.forPublic!.nonRevertibleAccumulatedData),
      convertAccumulatedData(data.forPublic!.revertibleAccumulatedData),
      0,
      data.forPublic!.publicTeardownCallRequest,
      data.feePayer,
      RevertCode.OK,
    );
  }

  // Temporary hack to create the AvmCircuitPublicInputs from public tail's public inputs.
  private generateAvmCircuitPublicInputs(tx: Tx, tailOutput: KernelCircuitPublicInputs, transactionFee: Fr) {
    const startTreeSnapshots = new TreeSnapshots(
      tailOutput.constants.historicalHeader.state.l1ToL2MessageTree,
      tailOutput.startState.noteHashTree,
      tailOutput.startState.nullifierTree,
      tailOutput.startState.publicDataTree,
    );

    const getArrayLengths = (from: PrivateToPublicAccumulatedData) =>
      new PrivateToAvmAccumulatedDataArrayLengths(
        countAccumulatedItems(from.noteHashes),
        countAccumulatedItems(from.nullifiers),
        countAccumulatedItems(from.l2ToL1Msgs),
      );

    const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) =>
      new PrivateToAvmAccumulatedData(from.noteHashes, from.nullifiers, from.l2ToL1Msgs);

    const convertAvmAccumulatedData = (from: CombinedAccumulatedData) =>
      new AvmAccumulatedData(
        from.noteHashes,
        from.nullifiers,
        from.l2ToL1Msgs,
        from.unencryptedLogsHashes,
        from.publicDataWrites,
      );

    // This is wrong. But this is not used or checked in the rollup at the moment.
    // Should fetch the updated roots from db.
    const endTreeSnapshots = startTreeSnapshots;

    return new AvmCircuitPublicInputs(
      tailOutput.constants.globalVariables,
      startTreeSnapshots,
      tx.data.gasUsed,
      tx.data.constants.txContext.gasSettings,
      tx.data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests,
      tx.data.forPublic!.revertibleAccumulatedData.publicCallRequests,
      tx.data.forPublic!.publicTeardownCallRequest,
      getArrayLengths(tx.data.forPublic!.nonRevertibleAccumulatedData),
      getArrayLengths(tx.data.forPublic!.revertibleAccumulatedData),
      convertAccumulatedData(tx.data.forPublic!.nonRevertibleAccumulatedData),
      convertAccumulatedData(tx.data.forPublic!.revertibleAccumulatedData),
      endTreeSnapshots,
      convertAvmAccumulatedData(tailOutput.end),
      transactionFee,
      !tailOutput.revertCode.equals(RevertCode.OK),
    );
  }
}
