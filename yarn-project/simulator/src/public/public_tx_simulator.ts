import {
  type AvmProvingRequest,
  type GasUsed,
  type MerkleTreeReadOperations,
  NestedProcessReturnValues,
  type SimulationError,
  type Tx,
  TxExecutionPhase,
  UnencryptedFunctionL2Logs,
} from '@aztec/circuit-types';
import { Gas, type GlobalVariables, MAX_L2_GAS_PER_ENQUEUED_CALL, type RevertCode } from '@aztec/circuits.js';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { type EnqueuedPublicCallExecutionResult } from './execution.js';
import { type PublicExecutor } from './executor.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicTxContext } from './public_tx_context.js';

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
    private globalVariables: GlobalVariables,
    private worldStateDB: WorldStateDB,
    private publicExecutor: PublicExecutor,
    private realAvmProvingRequests: boolean = true,
  ) {
    this.log = createDebugLogger(`aztec:public_tx_simulator`);
  }

  static create(
    db: MerkleTreeReadOperations,
    publicExecutor: PublicExecutor,
    globalVariables: GlobalVariables,
    worldStateDB: WorldStateDB,
    realAvmProvingRequests: boolean = true,
  ) {
    return new PublicTxSimulator(db, globalVariables, worldStateDB, publicExecutor, realAvmProvingRequests);
  }

  async simulate(tx: Tx): Promise<PublicTxResult> {
    this.log.verbose(`Processing tx ${tx.getTxHash()}`);

    const context = await PublicTxContext.create(this.db, this.worldStateDB, tx, this.globalVariables);

    // add new contracts to the contracts db so that their functions may be found and called
    // TODO(#4073): This is catching only private deployments, when we add public ones, we'll
    // have to capture contracts emitted in that phase as well.
    // TODO(@spalladino): Should we allow emitting contracts in the fee preparation phase?
    // TODO(#6464): Should we allow emitting contracts in the private setup phase?
    // if so, this should only add contracts that were deployed during private app logic.
    // FIXME: we shouldn't need to directly modify worldStateDb here!
    await this.worldStateDB.addNewContracts(tx);

    const processedPhases: ProcessedPhase[] = [];
    if (context.hasPhase(TxExecutionPhase.SETUP)) {
      const setupResult: ProcessedPhase = await this.simulateSetupPhase(context);
      processedPhases.push(setupResult);
    }
    if (context.hasPhase(TxExecutionPhase.APP_LOGIC)) {
      const appLogicResult: ProcessedPhase = await this.simulateAppLogicPhase(context);
      processedPhases.push(appLogicResult);
    }
    if (context.hasPhase(TxExecutionPhase.TEARDOWN)) {
      const teardownResult: ProcessedPhase = await this.simulateTeardownPhase(context);
      processedPhases.push(teardownResult);
    }
    context.halt();

    const endStateReference = await this.db.getStateReference();

    const avmProvingRequest = context.generateProvingRequest(endStateReference);
    const avmCircuitPublicInputs = avmProvingRequest.inputs.output!;

    const revertCode = context.getFinalRevertCode();
    if (!revertCode.isOK()) {
      // TODO(#6464): Should we allow emitting contracts in the private setup phase?
      // if so, this is removing contracts deployed in private setup
      // You can't submit contracts in public, so this is only relevant for private-created side effects
      // FIXME: we shouldn't need to directly modify worldStateDb here!
      await this.worldStateDB.removeNewContracts(tx);
      // FIXME(dbanks12): should not be changing immutable tx
      tx.filterRevertedLogs(
        tx.data.forPublic!.nonRevertibleAccumulatedData,
        avmCircuitPublicInputs.accumulatedData.unencryptedLogsHashes,
      );
    }
    // FIXME(dbanks12): should not be changing immutable tx
    tx.unencryptedLogs.addFunctionLogs([new UnencryptedFunctionL2Logs(context.trace.getUnencryptedLogs())]);

    return {
      avmProvingRequest,
      gasUsed: { totalGas: context.getActualGasUsed(), teardownGas: context.teardownGasUsed },
      revertCode,
      revertReason: context.revertReason,
      processedPhases: processedPhases,
    };
  }

  private async simulateSetupPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    return await this.simulatePhase(TxExecutionPhase.SETUP, context);
  }

  private async simulateAppLogicPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    // Fork the state manager so that we can rollback state if app logic or teardown reverts.
    // Don't need to fork for setup since it's non-revertible (if setup fails, transaction is thrown out).
    context.state.fork();

    const result = await this.simulatePhase(TxExecutionPhase.APP_LOGIC, context);

    if (result.reverted) {
      // Drop the currently active forked state manager and rollback to end of setup.
      context.state.discardForkedState();
    } else {
      if (!context.hasPhase(TxExecutionPhase.TEARDOWN)) {
        // Nothing to do after this (no teardown), so merge state updates now instead of letting teardown handle it.
        context.state.mergeForkedState();
      }
    }

    return result;
  }

  private async simulateTeardownPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    if (!context.state.isForked()) {
      // If state isn't forked (app logic was empty or reverted), fork now
      // so we can rollback to the end of setup if teardown reverts.
      context.state.fork();
    }

    const result = await this.simulatePhase(TxExecutionPhase.TEARDOWN, context);

    if (result.reverted) {
      // Drop the currently active forked state manager and rollback to end of setup.
      context.state.discardForkedState();
    } else {
      // Merge state updates from teardown,
      context.state.mergeForkedState();
    }

    return result;
  }

  private async simulatePhase(phase: TxExecutionPhase, context: PublicTxContext): Promise<ProcessedPhase> {
    const callRequests = context.getCallRequestsForPhase(phase);
    const executionRequests = context.getExecutionRequestsForPhase(phase);
    const txStateManager = context.state.getActiveStateManager();

    this.log.debug(`Beginning processing in phase ${TxExecutionPhase[phase]} for tx ${context.getTxHash()}`);

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

      const availableGas = context.getGasLeftForPhase(phase);
      // Gas allocated to an enqueued call can be different from the available gas
      // if there is more gas available than the max allocation per enqueued call.
      const allocatedGas = new Gas(
        /*daGas=*/ availableGas.daGas,
        /*l2Gas=*/ Math.min(availableGas.l2Gas, MAX_L2_GAS_PER_ENQUEUED_CALL),
      );

      const enqueuedCallResult = (await this.publicExecutor.simulate(
        txStateManager,
        executionRequest,
        this.globalVariables, // todo get from context
        allocatedGas,
        context.getTransactionFee(phase),
      )) as EnqueuedPublicCallExecutionResult;

      // TODO(dbanks12): remove once AVM proves entire public tx
      await context.updateProvingRequest(
        this.realAvmProvingRequests,
        phase,
        this.worldStateDB,
        txStateManager,
        executionRequest,
        enqueuedCallResult,
        allocatedGas,
      );

      txStateManager.traceEnqueuedCall(callRequest, executionRequest.args, enqueuedCallResult.reverted!);

      const gasUsed = allocatedGas.sub(Gas.from(enqueuedCallResult.endGasLeft));
      context.consumeGas(phase, gasUsed);
      returnValues.push(new NestedProcessReturnValues(enqueuedCallResult.returnValues));

      if (enqueuedCallResult.reverted) {
        reverted = true;
        const culprit = `${executionRequest.callContext.contractAddress}:${executionRequest.callContext.functionSelector}`;
        revertReason = enqueuedCallResult.revertReason;
        context.revert(phase, enqueuedCallResult.revertReason, culprit); // throws if in setup (non-revertible) phase
      }
    }

    return {
      phase,
      durationMs: phaseTimer.ms(),
      returnValues,
      reverted,
      revertReason,
    };
  }
}
