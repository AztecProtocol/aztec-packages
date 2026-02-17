import type { Fr } from '@aztec/foundation/curves/bn254';
import { Timer } from '@aztec/foundation/timer';
import type { PublicSimulatorConfig, PublicTxResult } from '@aztec/stdlib/avm';
import type { Gas } from '@aztec/stdlib/gas';
import type { AvmSimulationStats } from '@aztec/stdlib/stats';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import { type GlobalVariables, PublicCallRequestWithCalldata, Tx, TxExecutionPhase } from '@aztec/stdlib/tx';

import type { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import type { PublicPersistableStateManager } from '../state_manager/state_manager.js';
import { PublicTxContext } from './public_tx_context.js';
import { PublicTxSimulator } from './public_tx_simulator.js';
import type { MeasuredPublicTxSimulatorInterface } from './public_tx_simulator_interface.js';

/**
 * A public tx simulator that tracks miscellaneous simulation metrics without telemetry.
 */
export class MeasuredPublicTxSimulator extends PublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    protected readonly metrics: ExecutorMetricsInterface,
    config?: Partial<PublicSimulatorConfig>,
  ) {
    super(merkleTree, contractsDB, globalVariables, config);
  }

  public override async simulate(tx: Tx, txLabel: string = 'unlabeledTx'): Promise<PublicTxResult> {
    this.metrics.startRecordingTxSimulation(txLabel);
    let avmResult: PublicTxResult | undefined;
    try {
      avmResult = await super.simulate(tx);
    } finally {
      this.metrics.stopRecordingTxSimulation(txLabel, avmResult?.gasUsed, avmResult?.revertCode);
    }
    return avmResult;
  }

  protected override async insertNonRevertiblesFromPrivate(context: PublicTxContext) {
    const timer = new Timer();
    await super.insertNonRevertiblesFromPrivate(context);
    this.metrics.recordPrivateEffectsInsertion(timer.us(), 'non-revertible');
  }

  protected override async insertRevertiblesFromPrivate(context: PublicTxContext) {
    const timer = new Timer();
    await super.insertRevertiblesFromPrivate(context);
    this.metrics.recordPrivateEffectsInsertion(timer.us(), 'revertible');
  }

  protected override async simulatePhase(phase: TxExecutionPhase, context: PublicTxContext) {
    const timer = new Timer();
    const result = await super.simulatePhase(phase, context);
    result.durationMs = timer.ms();
    return result;
  }

  protected override async simulateEnqueuedCallInternal(
    stateManager: PublicPersistableStateManager,
    callRequest: PublicCallRequestWithCalldata,
    allocatedGas: Gas,
    transactionFee: Fr,
    fnName: string,
  ): Promise<AvmFinalizedCallResult> {
    const timer = new Timer();
    const result = await super.simulateEnqueuedCallInternal(
      stateManager,
      callRequest,
      allocatedGas,
      transactionFee,
      fnName,
    );

    this.log.verbose(
      result.reverted
        ? `Simulation of enqueued public call ${fnName} reverted with reason ${result.revertReason?.message}.`
        : `Simulation of enqueued public call ${fnName} completed successfully.`,
      {
        eventName: 'avm-simulation',
        appCircuitName: fnName,
        duration: timer.ms(),
      } satisfies AvmSimulationStats,
    );

    if (result.reverted) {
      this.metrics.recordEnqueuedCallSimulationFailure(
        fnName,
        timer.ms(),
        allocatedGas.sub(result.gasLeft).l2Gas,
        result.totalInstructions,
      );
    } else {
      this.metrics.recordEnqueuedCallSimulation(
        fnName,
        timer.ms(),
        allocatedGas.sub(result.gasLeft).l2Gas,
        result.totalInstructions,
      );
    }
    return result;
  }
}
