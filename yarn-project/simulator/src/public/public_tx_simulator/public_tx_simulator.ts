import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import {
  AvmFastSimulationInputs,
  AvmTxHint,
  type PublicSimulatorConfig,
  PublicTxResult,
  deserializeFromMessagePack,
} from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';
import { WorldStateRevision } from '@aztec/stdlib/world-state';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import type { AvmSimulator } from '../avm_simulator_pool.js';
import { ExecutorMetrics } from '../executor_metrics.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import { PublicTxSimulatorBase } from './public_tx_simulator_base.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
} from './public_tx_simulator_interface.js';

/**
 * Simulates a transaction's public portion using the C++ AVM simulator over IPC.
 * The C++ simulator runs in an external bb-avm-sim process, accesses world state via WSDB IPC, and
 * fetches contract data via CDB IPC (routed to the right PublicContractsDB by `wsdbForkId`, which the
 * caller registers on the CDB server before simulating).
 */
export class PublicTxSimulator extends PublicTxSimulatorBase implements PublicTxSimulatorInterface {
  protected override log: Logger;
  /** Aborts the in-flight simulation; the backend forwards this to the C++ process. */
  private abortController?: AbortController;
  /** Current simulation promise, used to wait for completion after cancellation. */
  private simulationPromise?: Promise<PublicTxResult>;

  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(avmSimulator, globalVariables, config, undefined, bindings, wsdbForkId);
    this.log = createLogger(`simulator:public_tx_simulator`, bindings);
  }

  /**
   * Simulate a transaction's public portion using the C++ AVM simulator.
   *
   * @param tx - The transaction to simulate.
   * @returns The result of the transaction's public execution.
   */
  public async simulate(tx: Tx): Promise<PublicTxResult> {
    this.abortController = new AbortController();
    this.simulationPromise = this.doSimulate(tx, this.abortController.signal);
    try {
      return await this.simulationPromise;
    } finally {
      this.abortController = undefined;
      this.simulationPromise = undefined;
    }
  }

  protected async doSimulate(tx: Tx, signal: AbortSignal): Promise<PublicTxResult> {
    const txHash = this.computeTxHash(tx);
    this.log.debug(
      `C++ IPC simulation of ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}, wsdbForkId=${
        this.wsdbForkId ?? 0
      }`,
      { txHash },
    );

    // Create the fast simulation inputs.
    const txHint = AvmTxHint.fromTx(tx, this.globalVariables.gasFees);
    const fastSimInputs = new AvmFastSimulationInputs(
      // blockNumber: WorldStateRevision.LATEST sentinel so the WSDB walks the fork's current
      // uncommitted state. Using 0 here makes WSDB treat this as a historical query against
      // the empty genesis tree and miss any in-fork uncommitted leaves (deployed contracts,
      // etc.) from earlier txs in the same block.
      { forkId: this.wsdbForkId ?? 0, blockNumber: WorldStateRevision.LATEST, includeUncommitted: true },
      this.config,
      txHint,
      this.globalVariables,
      this.protocolContracts,
    );

    this.log.trace(`Serializing fast simulation inputs to msgpack...`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    this.log.debug(`Calling C++ AVM simulator for tx ${txHash}`);
    let resultBuffer: Uint8Array;
    try {
      resultBuffer = await this.avmSimulator.simulate(inputBuffer, signal);
    } catch (error: any) {
      if (error.message?.includes('cancelled')) {
        throw new SimulationError(`C++ simulation cancelled`, []);
      }
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    }

    this.log.trace(`Deserializing C++ from buffer (size: ${resultBuffer.length})...`);
    const cppResultJSON: object = deserializeFromMessagePack(Buffer.from(resultBuffer));
    const cppResult = PublicTxResult.fromPlainObject(cppResultJSON);

    this.log.trace(`C++ simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !cppResult.revertCode.isOK(),
      cppGasUsed: cppResult.gasUsed.totalGas.l2Gas,
    });

    return cppResult;
  }

  /**
   * Cancel the current simulation if one is in progress.
   * This signals the external C++ AVM process to stop at the next opcode or before the next WorldState write.
   * Safe to call even if no simulation is in progress.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   *                        This is important because C++ might be in the middle of a slow operation
   *                        (e.g., pad_trees) and won't check the cancellation flag until it completes.
   *                        Default timeout of 100ms after cancellation.
   */
  public async cancel(waitTimeoutMs: number = 100): Promise<void> {
    if (this.abortController) {
      this.log.debug('Cancelling C++ AVM simulation');
      this.abortController.abort();
    }

    if (this.simulationPromise) {
      this.log.debug(`Waiting up to ${waitTimeoutMs}ms for C++ simulation to stop`);
      await Promise.race([
        this.simulationPromise.catch(() => {}), // Ignore rejection, just wait for completion
        sleep(waitTimeoutMs),
      ]);
      this.log.debug('C++ simulation stopped or wait timed out');
    }
  }
}

export class MeasuredPublicTxSimulator extends PublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    protected readonly metrics: ExecutorMetricsInterface,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(avmSimulator, globalVariables, config, bindings, wsdbForkId);
  }

  public override async simulate(tx: Tx, txLabel: string = 'unlabeledTx'): Promise<PublicTxResult> {
    this.metrics.startRecordingTxSimulation(txLabel);
    let result: PublicTxResult | undefined;
    try {
      result = await super.simulate(tx);
    } finally {
      this.metrics.stopRecordingTxSimulation(txLabel, result?.gasUsed, result?.revertCode);
    }
    return result;
  }
}

/**
 * A C++ public tx simulator that tracks runtime/production metrics with telemetry.
 */
export class TelemetryPublicTxSimulator extends MeasuredPublicTxSimulator {
  /* tracer needed by trackSpans */
  public readonly tracer: Tracer;

  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    const metrics = new ExecutorMetrics(telemetryClient, 'PublicTxSimulator');
    super(avmSimulator, globalVariables, metrics, config, bindings, wsdbForkId);
    this.tracer = metrics.tracer;
  }
}
