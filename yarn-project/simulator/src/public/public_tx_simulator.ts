import {
  type AvmProvingRequest,
  type GasUsed,
  type MerkleTreeReadOperations,
  NestedProcessReturnValues,
  type PublicExecutionRequest,
  type SimulationError,
  type Tx,
  TxExecutionPhase,
} from '@aztec/circuit-types';
import { type AvmSimulationStats } from '@aztec/circuit-types/stats';
import { type Fr, type Gas, type GlobalVariables, type PublicCallRequest, type RevertCode } from '@aztec/circuits.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { strict as assert } from 'assert';

import { type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmPersistableStateManager, AvmSimulator } from '../avm/index.js';
import { NullifierCollisionError } from '../avm/journal/nullifiers.js';
import { getPublicFunctionDebugName } from '../common/debug_fn_name.js';
import { ExecutorMetrics } from './executor_metrics.js';
import { computeFeePayerBalanceStorageSlot } from './fee_payment.js';
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
  metrics: ExecutorMetrics;

  private log: Logger;

  constructor(
    private db: MerkleTreeReadOperations,
    private worldStateDB: WorldStateDB,
    telemetryClient: TelemetryClient,
    private globalVariables: GlobalVariables,
    private doMerkleOperations: boolean = false,
    private enforceFeePayment: boolean = true,
  ) {
    this.log = createLogger(`simulator:public_tx_simulator`);
    this.metrics = new ExecutorMetrics(telemetryClient, 'PublicTxSimulator');
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }
  /**
   * Simulate a transaction's public portion including all of its phases.
   * @param tx - The transaction to simulate.
   * @returns The result of the transaction's public execution.
   */
  public async simulate(tx: Tx): Promise<PublicTxResult> {
    const txHash = tx.getTxHash();
    this.log.debug(`Simulating ${tx.enqueuedPublicFunctionCalls.length} public calls for tx ${txHash}`, { txHash });

    const context = await PublicTxContext.create(
      this.db,
      this.worldStateDB,
      tx,
      this.globalVariables,
      this.doMerkleOperations,
    );

    // add new contracts to the contracts db so that their functions may be found and called
    // TODO(#4073): This is catching only private deployments, when we add public ones, we'll
    // have to capture contracts emitted in that phase as well.
    // TODO(@spalladino): Should we allow emitting contracts in the fee preparation phase?
    // TODO(#6464): Should we allow emitting contracts in the private setup phase?
    // if so, this should only add contracts that were deployed during private app logic.
    // FIXME: we shouldn't need to directly modify worldStateDb here!
    await this.worldStateDB.addNewContracts(tx);

    const nonRevertStart = process.hrtime.bigint();
    await this.insertNonRevertiblesFromPrivate(context);
    const nonRevertEnd = process.hrtime.bigint();
    this.metrics.recordPrivateEffectsInsertion(Number(nonRevertEnd - nonRevertStart) / 1_000, 'non-revertible');
    const processedPhases: ProcessedPhase[] = [];
    if (context.hasPhase(TxExecutionPhase.SETUP)) {
      const setupResult: ProcessedPhase = await this.simulateSetupPhase(context);
      processedPhases.push(setupResult);
    }

    const revertStart = process.hrtime.bigint();
    await this.insertRevertiblesFromPrivate(context);
    const revertEnd = process.hrtime.bigint();
    this.metrics.recordPrivateEffectsInsertion(Number(revertEnd - revertStart) / 1_000, 'revertible');
    if (context.hasPhase(TxExecutionPhase.APP_LOGIC)) {
      const appLogicResult: ProcessedPhase = await this.simulateAppLogicPhase(context);
      processedPhases.push(appLogicResult);
    }

    if (context.hasPhase(TxExecutionPhase.TEARDOWN)) {
      const teardownResult: ProcessedPhase = await this.simulateTeardownPhase(context);
      processedPhases.push(teardownResult);
    }

    context.halt();
    await this.payFee(context);

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
        avmCircuitPublicInputs.accumulatedData.publicLogs,
      );
    }
    // FIXME(dbanks12): should not be changing immutable tx
    tx.publicLogs.push(...context.trace.getPublicLogs());

    return {
      avmProvingRequest,
      gasUsed: {
        totalGas: context.getActualGasUsed(),
        teardownGas: context.teardownGasUsed,
        publicGas: context.getActualPublicGasUsed(),
      },
      revertCode,
      revertReason: context.revertReason,
      processedPhases: processedPhases,
    };
  }

  /**
   * Simulate the setup phase of a transaction's public execution.
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @returns The phase result.
   */
  private async simulateSetupPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    return await this.simulatePhase(TxExecutionPhase.SETUP, context);
  }

  /**
   * Simulate the app logic phase of a transaction's public execution.
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @returns The phase result.
   */
  private async simulateAppLogicPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    assert(context.state.isForked(), 'App logic phase should operate with forked state.');

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

  /**
   * Simulate the teardown phase of a transaction's public execution.
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @returns The phase result.
   */
  private async simulateTeardownPhase(context: PublicTxContext): Promise<ProcessedPhase> {
    if (!context.state.isForked()) {
      // If state isn't forked (app logic reverted), fork now
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

  /**
   * Simulate a phase of a transaction's public execution.
   * @param phase - The current phase
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @returns The phase result.
   */
  private async simulatePhase(phase: TxExecutionPhase, context: PublicTxContext): Promise<ProcessedPhase> {
    const callRequests = context.getCallRequestsForPhase(phase);
    const executionRequests = context.getExecutionRequestsForPhase(phase);

    this.log.debug(`Processing phase ${TxExecutionPhase[phase]} for tx ${context.txHash}`, {
      txHash: context.txHash.toString(),
      phase: TxExecutionPhase[phase],
      callRequests: callRequests.length,
      executionRequests: executionRequests.length,
    });

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

      const enqueuedCallResult = await this.simulateEnqueuedCall(phase, context, callRequest, executionRequest);

      returnValues.push(new NestedProcessReturnValues(enqueuedCallResult.output));

      if (enqueuedCallResult.reverted) {
        reverted = true;
        revertReason = enqueuedCallResult.revertReason;
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

  /**
   * Simulate an enqueued public call.
   * @param phase - The current phase of public execution
   * @param context - WILL BE MUTATED. The context of the currently executing public transaction portion
   * @param callRequest - The enqueued call to execute
   * @param executionRequest - The execution request (includes args)
   * @returns The result of execution.
   */
  @trackSpan('PublicTxSimulator.simulateEnqueuedCall', (phase, context, _callRequest, executionRequest) => ({
    [Attributes.TX_HASH]: context.txHash.toString(),
    [Attributes.TARGET_ADDRESS]: executionRequest.callContext.contractAddress.toString(),
    [Attributes.SENDER_ADDRESS]: executionRequest.callContext.msgSender.toString(),
    [Attributes.SIMULATOR_PHASE]: TxExecutionPhase[phase].toString(),
  }))
  private async simulateEnqueuedCall(
    phase: TxExecutionPhase,
    context: PublicTxContext,
    callRequest: PublicCallRequest,
    executionRequest: PublicExecutionRequest,
  ): Promise<AvmFinalizedCallResult> {
    const stateManager = context.state.getActiveStateManager();
    const address = executionRequest.callContext.contractAddress;
    const fnName = await getPublicFunctionDebugName(this.worldStateDB, address, executionRequest.args);

    const allocatedGas = context.getGasLeftAtPhase(phase);

    const result = await this.simulateEnqueuedCallInternal(
      context.state.getActiveStateManager(),
      executionRequest,
      allocatedGas,
      /*transactionFee=*/ context.getTransactionFee(phase),
      fnName,
    );

    const gasUsed = allocatedGas.sub(result.gasLeft); // by enqueued call
    context.consumeGas(phase, gasUsed);
    this.log.debug(
      `Simulated enqueued public call consumed ${gasUsed.l2Gas} L2 gas ending with ${result.gasLeft.l2Gas} L2 gas left.`,
    );

    stateManager.traceEnqueuedCall(callRequest, executionRequest.args, result.reverted);

    if (result.reverted) {
      const culprit = `${executionRequest.callContext.contractAddress}:${executionRequest.callContext.functionSelector}`;
      context.revert(phase, result.revertReason, culprit); // throws if in setup (non-revertible) phase
    }

    return result;
  }

  /**
   * Simulate an enqueued public call, without modifying the context (PublicTxContext).
   * Resulting modifcations to the context can be applied by the caller.
   *
   * This function can be mocked for testing to skip actual AVM simulation
   * while still simulating phases and generating a proving request.
   *
   * @param stateManager - The state manager for AvmSimulation
   * @param context - The context of the currently executing public transaction portion
   * @param executionRequest - The execution request (includes args)
   * @param allocatedGas - The gas allocated to the enqueued call
   * @param fnName - The name of the function
   * @returns The result of execution.
   */
  @trackSpan(
    'PublicTxSimulator.simulateEnqueuedCallInternal',
    (_stateManager, _executionRequest, _allocatedGas, _transactionFee, fnName) => ({
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    }),
  )
  private async simulateEnqueuedCallInternal(
    stateManager: AvmPersistableStateManager,
    executionRequest: PublicExecutionRequest,
    allocatedGas: Gas,
    transactionFee: Fr,
    fnName: string,
  ): Promise<AvmFinalizedCallResult> {
    const address = executionRequest.callContext.contractAddress;
    const sender = executionRequest.callContext.msgSender;

    this.log.debug(
      `Executing enqueued public call to external function ${fnName}@${address} with ${allocatedGas.l2Gas} allocated L2 gas.`,
    );
    const timer = new Timer();

    const simulator = await AvmSimulator.create(
      stateManager,
      address,
      sender,
      transactionFee,
      this.globalVariables,
      executionRequest.callContext.isStaticCall,
      executionRequest.args,
      allocatedGas,
    );
    const avmCallResult = await simulator.execute();
    const result = avmCallResult.finalize();

    this.log.verbose(
      result.reverted
        ? `Simulation of enqueued public call ${fnName} reverted with reason ${result.revertReason}.`
        : `Simulation of enqueued public call ${fnName} completed successfully.`,
      {
        eventName: 'avm-simulation',
        appCircuitName: fnName,
        duration: timer.ms(),
      } satisfies AvmSimulationStats,
    );

    if (result.reverted) {
      this.metrics.recordFunctionSimulationFailure();
    } else {
      this.metrics.recordFunctionSimulation(timer.ms(), allocatedGas.sub(result.gasLeft).l2Gas, fnName);
    }

    return result;
  }

  /**
   * Insert the non-revertible accumulated data from private into the public state.
   */
  public async insertNonRevertiblesFromPrivate(context: PublicTxContext) {
    const stateManager = context.state.getActiveStateManager();
    try {
      await stateManager.writeSiloedNullifiersFromPrivate(context.nonRevertibleAccumulatedDataFromPrivate.nullifiers);
    } catch (e) {
      if (e instanceof NullifierCollisionError) {
        throw new NullifierCollisionError(
          `Nullifier collision encountered when inserting non-revertible nullifiers from private.\nDetails: ${e.message}\n.Stack:${e.stack}`,
        );
      }
    }
    for (const noteHash of context.nonRevertibleAccumulatedDataFromPrivate.noteHashes) {
      if (!noteHash.isEmpty()) {
        stateManager.writeUniqueNoteHash(noteHash);
      }
    }
  }

  /**
   * Insert the revertible accumulated data from private into the public state.
   * Start by forking state so we can rollback to the end of setup if app logic or teardown reverts.
   */
  public async insertRevertiblesFromPrivate(context: PublicTxContext) {
    // Fork the state manager so we can rollback to end of setup if app logic reverts.
    context.state.fork();
    const stateManager = context.state.getActiveStateManager();
    try {
      await stateManager.writeSiloedNullifiersFromPrivate(context.revertibleAccumulatedDataFromPrivate.nullifiers);
    } catch (e) {
      if (e instanceof NullifierCollisionError) {
        throw new NullifierCollisionError(
          `Nullifier collision encountered when inserting revertible nullifiers from private. Details:\n${e.message}\n.Stack:${e.stack}`,
        );
      }
    }
    for (const noteHash of context.revertibleAccumulatedDataFromPrivate.noteHashes) {
      if (!noteHash.isEmpty()) {
        // Revertible note hashes from private are not hashed with nonce, since private can't know their final position, only we can.
        stateManager.writeSiloedNoteHash(noteHash);
      }
    }
  }

  private async payFee(context: PublicTxContext) {
    const txFee = context.getTransactionFee(TxExecutionPhase.TEARDOWN);

    if (context.feePayer.isZero()) {
      this.log.debug(`No one is paying the fee of ${txFee.toBigInt()}`);
      return;
    }

    const feeJuiceAddress = ProtocolContractAddress.FeeJuice;
    const balanceSlot = computeFeePayerBalanceStorageSlot(context.feePayer);

    this.log.debug(`Deducting ${txFee.toBigInt()} balance in Fee Juice for ${context.feePayer}`);
    const stateManager = context.state.getActiveStateManager();

    let currentBalance = await stateManager.readStorage(feeJuiceAddress, balanceSlot);
    // We allow to fake the balance of the fee payer to allow fee estimation
    // When mocking the balance of the fee payer, the circuit should not be able to prove the simulation

    if (currentBalance.lt(txFee)) {
      if (this.enforceFeePayment) {
        throw new Error(
          `Not enough balance for fee payer to pay for transaction (got ${currentBalance.toBigInt()} needs ${txFee.toBigInt()})`,
        );
      } else {
        currentBalance = txFee;
      }
    }

    const updatedBalance = currentBalance.sub(txFee);
    await stateManager.writeStorage(feeJuiceAddress, balanceSlot, updatedBalance, true);
  }
}
