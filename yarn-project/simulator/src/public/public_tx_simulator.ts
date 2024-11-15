import {
  type AvmProvingRequest,
  type GasUsed,
  type MerkleTreeReadOperations,
  type NestedProcessReturnValues,
  type SimulationError,
  type Tx,
  TxExecutionPhase,
} from '@aztec/circuit-types';
import { type GlobalVariables, type Header, type RevertCode } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { EnqueuedCallSimulator } from './enqueued_call_simulator.js';
import { type PublicExecutor } from './executor.js';
import { type WorldStateDB } from './public_db_sources.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';
import { PublicKernelTailSimulator } from './public_kernel_tail_simulator.js';
import { PublicTxContext } from './public_tx_context.js';
import { generateAvmCircuitPublicInputs, runMergeKernelCircuit } from './utils.js';

export type ProcessedPhase = {
  phase: TxExecutionPhase;
  durationMs: number;
  returnValues: NestedProcessReturnValues[];
  reverted: boolean;
  revertReason?: SimulationError;
};

export type PublicTxResult = {
  avmProvingRequest: AvmProvingRequest;
  /** Gas used during the execution of this tx */
  gasUsed: GasUsed;
  revertCode: RevertCode;
  /** Revert reason, if any */
  revertReason?: SimulationError;
  processedPhases: ProcessedPhase[];
};

export class PublicTxSimulator {
  private log: DebugLogger;

  constructor(
    private db: MerkleTreeReadOperations,
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

    return new PublicTxSimulator(
      db,
      publicKernelSimulator,
      globalVariables,
      worldStateDB,
      enqueuedCallSimulator,
      publicKernelTailSimulator,
    );
  }

  async process(tx: Tx): Promise<PublicTxResult> {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);

    const context = await PublicTxContext.create(this.db, this.worldStateDB, tx, this.globalVariables);

    const setupResult = await this.processSetupPhase(context);
    const appLogicResult = await this.processAppLogicPhase(context);
    const teardownResult = await this.processTeardownPhase(context);

    const processedPhases = [setupResult, appLogicResult, teardownResult].filter(
      result => result !== undefined,
    ) as ProcessedPhase[];

    const _endStateReference = await this.db.getStateReference();
    const transactionFee = context.getTransactionFee();

    const tailKernelOutput = await this.publicKernelTailSimulator.simulate(context.latestPublicKernelOutput);

    context.avmProvingRequest!.inputs.output = generateAvmCircuitPublicInputs(
      tx,
      tailKernelOutput,
      context.getGasUsedForFee(),
      transactionFee,
    );

    const gasUsed = {
      totalGas: context.getActualGasUsed(),
      teardownGas: context.teardownGasUsed,
    };
    return {
      avmProvingRequest: context.avmProvingRequest!,
      gasUsed,
      revertCode: context.revertCode,
      revertReason: context.revertReason,
      processedPhases: processedPhases,
    };
  }

  private async processSetupPhase(context: PublicTxContext): Promise<ProcessedPhase | undefined> {
    // Start in phase TxExecutionPhase.SETUP;
    if (context.hasPhase()) {
      return await this.processPhase(context);
    }
  }

  private async processAppLogicPhase(context: PublicTxContext): Promise<ProcessedPhase | undefined> {
    context.progressToNextPhase(); // to app logic
    if (context.hasPhase()) {
      // Fork the state manager so that we can rollback state if app logic or teardown reverts.
      // Don't need to fork for setup since it's non-revertible (if setup fails, transaction is thrown out).
      context.state.fork();

      const result = await this.processPhase(context);

      if (result.reverted) {
        // Drop the currently active forked state manager and rollback to end of setup.
        // Fork again for teardown so that if teardown fails we can again rollback to end of setup.
        context.state.discardForkedState();
      } else {
        if (!context.hasPhase(TxExecutionPhase.TEARDOWN)) {
          // Nothing to do after this (no teardown), so merge state in now instead of letting teardown handle it.
          context.state.mergeForkedState();
        }
      }

      return result;
    }
  }

  private async processTeardownPhase(context: PublicTxContext): Promise<ProcessedPhase | undefined> {
    context.progressToNextPhase(); // to teardown
    if (context.hasPhase()) {
      if (!context.state.isForked()) {
        // if state isn't forked (app logic was empty or reverted), fork now
        // so we can rollback to the end of setup on teardown revert
        context.state.fork();
      }

      const result = await this.processPhase(context);

      if (result.reverted) {
        // Drop the currently active forked state manager and rollback to end of setup.
        context.state.discardForkedState();
      } else {
        context.state.mergeForkedState();
      }

      return result;
    }
  }

  private async processPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    const tx = context.tx;
    const callRequests = context.getCallRequestsForCurrentPhase();
    const executionRequests = context.getExecutionRequestsForCurrentPhase();
    const txStateManager = context.state.getActiveStateManager();

    this.log.debug(
      `Beginning processing in phase ${TxExecutionPhase[context.getCurrentPhase()]} for tx ${tx.getTxHash()}`,
    );

    const returnValues: NestedProcessReturnValues[] = [];
    let reverted = false;
    let revertReason: SimulationError | undefined;
    const phaseTimer = new Timer();
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
      // FIXME: we shouldn't need to directly modify worldStateDb here!
      await this.worldStateDB.addNewContracts(tx);

      // each enqueued call starts with an incremented side effect counter
      // FIXME: should be able to stop forking here and just trace the enqueued call (for hinting)
      // and proceed with the same state manager for the entire phase
      const enqueuedCallStateManager = txStateManager.fork(/*incrementSideEffectCounter=*/ true);
      const enqueuedCallResult = await this.enqueuedCallSimulator.simulate(
        callRequest,
        executionRequest,
        context.constants,
        /*availableGas=*/ context.getGasLeftForCurrentPhase(),
        /*transactionFee=*/ context.getTransactionFeeAtCurrentPhase(),
        enqueuedCallStateManager,
      );

      txStateManager.traceEnqueuedCall(callRequest, executionRequest.args, enqueuedCallResult.reverted!);

      context.consumeGas(enqueuedCallResult.gasUsed);
      returnValues.push(enqueuedCallResult.returnValues);
      // Propagate only one avmProvingRequest of a function call for now, so that we know it's still provable.
      // Eventually this will be the proof for the entire public portion of the transaction.
      context.avmProvingRequest = enqueuedCallResult.avmProvingRequest;
      if (enqueuedCallResult.reverted) {
        reverted = true;
        const culprit = `${executionRequest.callContext.contractAddress}:${executionRequest.callContext.functionSelector}`;
        revertReason = enqueuedCallResult.revertReason;
        context.revert(enqueuedCallResult.revertReason, culprit); // throws if in setup (non-revertible) phase

        // TODO(#6464): Should we allow emitting contracts in the private setup phase?
        // if so, this is removing contracts deployed in private setup
        // You can't submit contracts in public, so this is only relevant for private-created side effects
        // FIXME: we shouldn't need to directly modify worldStateDb here!
        await this.worldStateDB.removeNewContracts(tx);
        // FIXME: we shouldn't be modifying the transaction here!
        tx.filterRevertedLogs(context.latestPublicKernelOutput);
        // Enqueeud call reverted. Discard state updates and accumulated side effects, but keep hints traced for the circuit.
        txStateManager.rejectForkedState(enqueuedCallStateManager);
      } else {
        // FIXME: we shouldn't be modifying the transaction here!
        tx.unencryptedLogs.addFunctionLogs([enqueuedCallResult.newUnencryptedLogs]);
        // Enqueued call succeeded! Merge in any state updates made in the forked state manager.
        txStateManager.mergeForkedState(enqueuedCallStateManager);
      }

      context.latestPublicKernelOutput = await runMergeKernelCircuit(
        context.latestPublicKernelOutput,
        enqueuedCallResult.kernelOutput,
        this.publicKernelSimulator,
      );
    }

    return {
      phase: context.getCurrentPhase(),
      durationMs: phaseTimer.ms(),
      returnValues,
      reverted,
      revertReason,
    };
  }
}
