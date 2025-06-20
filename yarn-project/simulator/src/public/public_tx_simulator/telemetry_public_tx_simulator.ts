import type { Fr } from '@aztec/foundation/fields';
import type { Gas } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import { type GlobalVariables, PublicCallRequestWithCalldata, TxExecutionPhase } from '@aztec/stdlib/tx';
import { Attributes, type TelemetryClient, type Tracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';

import type { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { ExecutorMetrics } from '../executor_metrics.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import type { PublicPersistableStateManager } from '../state_manager/state_manager.js';
import { MeasuredPublicTxSimulator } from './measured_public_tx_simulator.js';
import { PublicTxContext } from './public_tx_context.js';

/**
 * A public tx simulator that tracks runtime/production metrics with telemetry.
 */
export class TelemetryPublicTxSimulator extends MeasuredPublicTxSimulator {
  /* tracer needed by trackSpans */
  public readonly tracer: Tracer;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean = false,
    skipFeeEnforcement: boolean = false,
    clientInitiatedSimulation: boolean = false,
    telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    const metrics = new ExecutorMetrics(telemetryClient, 'PublicTxSimulator');
    super(
      merkleTree,
      contractsDB,
      globalVariables,
      doMerkleOperations,
      skipFeeEnforcement,
      clientInitiatedSimulation,
      metrics,
    );
    this.tracer = metrics.tracer;
  }

  @trackSpan('PublicTxSimulator.simulateEnqueuedCall', (phase, context, callRequest) => ({
    [Attributes.TX_HASH]: context.txHash.toString(),
    [Attributes.TARGET_ADDRESS]: callRequest.request.contractAddress.toString(),
    [Attributes.SENDER_ADDRESS]: callRequest.request.msgSender.toString(),
    [Attributes.SIMULATOR_PHASE]: TxExecutionPhase[phase].toString(),
  }))
  protected override async simulateEnqueuedCall(
    phase: TxExecutionPhase,
    context: PublicTxContext,
    callRequest: PublicCallRequestWithCalldata,
  ): Promise<AvmFinalizedCallResult> {
    return await super.simulateEnqueuedCall(phase, context, callRequest);
  }

  @trackSpan(
    'PublicTxSimulator.simulateEnqueuedCallInternal',
    (_stateManager, _callRequest, _allocatedGas, _transactionFee, fnName) => ({
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    }),
  )
  protected override async simulateEnqueuedCallInternal(
    stateManager: PublicPersistableStateManager,
    callRequest: PublicCallRequestWithCalldata,
    allocatedGas: Gas,
    transactionFee: Fr,
    fnName: string,
  ): Promise<AvmFinalizedCallResult> {
    return await super.simulateEnqueuedCallInternal(stateManager, callRequest, allocatedGas, transactionFee, fnName);
  }
}
