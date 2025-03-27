import type { Fr } from '@aztec/foundation/fields';
import { Timer } from '@aztec/foundation/timer';
import type { Gas } from '@aztec/stdlib/gas';
import type { AvmSimulationStats } from '@aztec/stdlib/stats';
import { type GlobalVariables, PublicCallRequestWithCalldata, Tx, TxExecutionPhase } from '@aztec/stdlib/tx';

import type { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import type { AvmPersistableStateManager } from '../avm/index.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB, PublicTreesDB } from '../public_db_sources.js';
import { PublicTxContext } from './public_tx_context.js';
import { type ProcessedPhase, type PublicTxResult, PublicTxSimulator } from './public_tx_simulator.js';

/**
 * A public tx simulator that tracks miscellaneous simulation metrics during testing.
 */
export class MeasuredPublicTxSimulator extends PublicTxSimulator {
  constructor(
    treesDB: PublicTreesDB,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    doMerkleOperations: boolean = false,
    skipFeeEnforcement: boolean = false,
    protected readonly metrics: ExecutorMetricsInterface,
  ) {
    super(treesDB, contractsDB, globalVariables, doMerkleOperations, skipFeeEnforcement);
  }

  public override async simulate(tx: Tx): Promise<PublicTxResult> {
    const timer = new Timer();
    const result = await super.simulate(tx);
    this.log.debug(`Public TX simulator took ${timer.ms()} ms\n`);
    return result;
  }

  protected override async computeTxHash(tx: Tx) {
    const startTime = process.hrtime.bigint();
    const txHash = await super.computeTxHash(tx);
    this.metrics.recordTxHashComputation(Number(process.hrtime.bigint() - startTime) / 1_000_000);
    return txHash;
  }

  protected override async insertNonRevertiblesFromPrivate(context: PublicTxContext, tx: Tx) {
    const timer = new Timer();
    await super.insertNonRevertiblesFromPrivate(context, tx);
    this.metrics.recordPrivateEffectsInsertion(timer.us(), 'non-revertible');
  }

  protected override async insertRevertiblesFromPrivate(context: PublicTxContext, tx: Tx): Promise<boolean> {
    const timer = new Timer();
    const result = await super.insertRevertiblesFromPrivate(context, tx);
    this.metrics.recordPrivateEffectsInsertion(timer.us(), 'revertible');
    return result;
  }

  protected override async simulatePhase(phase: TxExecutionPhase, context: PublicTxContext): Promise<ProcessedPhase> {
    const timer = new Timer();
    const result = await super.simulatePhase(phase, context);
    result.durationMs = timer.ms();
    return result;
  }

  protected override async simulateEnqueuedCallInternal(
    stateManager: AvmPersistableStateManager,
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
        ? `Simulation of enqueued public call ${fnName} reverted with reason ${result.revertReason}.`
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
