import { type PublicExecutionRequest } from '@aztec/circuit-types';
import { type AvmSimulationStats } from '@aztec/circuit-types/stats';
import { Fr, Gas, type GlobalVariables } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { AvmContext } from '../avm/avm_context.js';
import { AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { AvmMachineState } from '../avm/avm_machine_state.js';
import { AvmSimulator } from '../avm/avm_simulator.js';
import { AvmPersistableStateManager } from '../avm/journal/index.js';
import { getPublicFunctionDebugName } from '../common/debug_fn_name.js';
import { DualSideEffectTrace } from './dual_side_effect_trace.js';
import { PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { type PublicExecutionResult } from './execution.js';
import { ExecutorMetrics } from './executor_metrics.js';
import { type WorldStateDB } from './public_db_sources.js';
import { PublicSideEffectTrace } from './side_effect_trace.js';

/**
 * Handles execution of public functions.
 */
export class PublicExecutor {
  metrics: ExecutorMetrics;

  constructor(private readonly worldStateDB: WorldStateDB, client: TelemetryClient) {
    this.metrics = new ExecutorMetrics(client, 'PublicExecutor');
  }

  static readonly log = createDebugLogger('aztec:simulator:public_executor');

  /**
   * Executes a public execution request.
   * @param executionRequest - The execution to run.
   * @param globalVariables - The global variables to use.
   * @param allocatedGas - The gas available at the start of this enqueued call.
   * @param transactionFee - Fee offered for this TX.
   * @returns The result of execution, including the results of all nested calls.
   */
  public async simulate(
    stateManager: AvmPersistableStateManager,
    executionRequest: PublicExecutionRequest, // TODO(dbanks12): CallRequest instead?
    globalVariables: GlobalVariables,
    allocatedGas: Gas,
    transactionFee: Fr = Fr.ZERO,
  ): Promise<PublicExecutionResult> {
    const address = executionRequest.callContext.contractAddress;
    const selector = executionRequest.callContext.functionSelector;
    // TODO(dbanks12): move function name debugging elsewhere? or add it to state manager?
    const fnName = await getPublicFunctionDebugName(this.worldStateDB, address, selector, executionRequest.args);

    PublicExecutor.log.verbose(
      `[AVM] Executing public external function ${fnName}@${address} with ${allocatedGas.l2Gas} allocated L2 gas.`,
    );
    const timer = new Timer();

    const avmExecutionEnv = createAvmExecutionEnvironment(executionRequest, globalVariables, transactionFee);

    const avmMachineState = new AvmMachineState(allocatedGas);
    const avmContext = new AvmContext(stateManager, avmExecutionEnv, avmMachineState);
    const simulator = new AvmSimulator(avmContext);
    const avmResult = await simulator.execute();
    const bytecode = simulator.getBytecode()!;

    PublicExecutor.log.verbose(
      `[AVM] ${fnName} returned, reverted: ${avmResult.reverted}${
        avmResult.reverted ? ', reason: ' + avmResult.revertReason : ''
      }.`,
      {
        eventName: 'avm-simulation',
        appCircuitName: fnName,
        duration: timer.ms(),
        bytecodeSize: bytecode!.length,
      } satisfies AvmSimulationStats,
    );

    const publicExecutionResult = stateManager.trace.toPublicExecutionResult(
      avmExecutionEnv,
      /*startGasLeft=*/ allocatedGas,
      /*endGasLeft=*/ Gas.from(avmContext.machineState.gasLeft),
      bytecode,
      avmResult,
      fnName,
    );

    if (avmResult.reverted) {
      this.metrics.recordFunctionSimulationFailure();
    } else {
      this.metrics.recordFunctionSimulation(bytecode.length, timer.ms());
    }

    PublicExecutor.log.verbose(
      `[AVM] ${fnName} simulation complete. Reverted=${avmResult.reverted}. Consumed ${
        allocatedGas.l2Gas - avmContext.machineState.gasLeft.l2Gas
      } L2 gas, ending with ${avmContext.machineState.gasLeft.l2Gas} L2 gas left.`,
    );

    return publicExecutionResult;
  }

  // WARNING: do not call from enqueued call simulator!
  public async simulateSimple(
    executionRequest: PublicExecutionRequest, // TODO(dbanks12): CallRequest instead?
    globalVariables: GlobalVariables,
    allocatedGas: Gas,
    transactionFee: Fr = Fr.ZERO,
  ): Promise<PublicExecutionResult> {
    const innerCallTrace = new PublicSideEffectTrace();
    const enqueuedCallTrace = new PublicEnqueuedCallSideEffectTrace();
    const trace = new DualSideEffectTrace(innerCallTrace, enqueuedCallTrace);
    const stateManager = new AvmPersistableStateManager(this.worldStateDB, trace);
    return await this.simulate(stateManager, executionRequest, globalVariables, allocatedGas, transactionFee);
  }

  public getDefaultStateManager(): AvmPersistableStateManager {
    const innerCallTrace = new PublicSideEffectTrace();
    const enqueuedCallTrace = new PublicEnqueuedCallSideEffectTrace();
    const trace = new DualSideEffectTrace(innerCallTrace, enqueuedCallTrace);
    return new AvmPersistableStateManager(this.worldStateDB, trace);
  }
}

/**
 * Convert a PublicExecutionRequest object to an AvmExecutionEnvironment
 *
 * @param executionRequest
 * @param globalVariables
 * @returns
 */
export function createAvmExecutionEnvironment(
  executionRequest: PublicExecutionRequest,
  globalVariables: GlobalVariables,
  transactionFee: Fr,
): AvmExecutionEnvironment {
  return new AvmExecutionEnvironment(
    executionRequest.callContext.contractAddress,
    executionRequest.callContext.msgSender,
    executionRequest.callContext.functionSelector,
    /*contractCallDepth=*/ Fr.zero(),
    transactionFee,
    globalVariables,
    executionRequest.callContext.isStaticCall,
    executionRequest.args,
  );
}
