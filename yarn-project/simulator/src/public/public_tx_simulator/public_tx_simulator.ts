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

import type { AvmContractsDBContext, AvmSimulator } from '../avm_simulator.js';
import { ExecutorMetrics } from '../executor_metrics.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { PublicTxSimulatorBase } from './public_tx_simulator_base.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
} from './public_tx_simulator_interface.js';

/**
 * Simulates a transaction's public portion by running its public calls through an {@link AvmSimulator}.
 * `forkId` selects the fork whose contract data the simulation reads.
 */
export class PublicTxSimulator extends PublicTxSimulatorBase implements PublicTxSimulatorInterface {
  protected override log: Logger;
  /** Aborts the in-flight simulation. */
  private abortController?: AbortController;
  /** Current simulation promise, used to wait for completion after cancellation. */
  private simulationPromise?: Promise<PublicTxResult>;

  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    contractsDB: PublicContractsDB,
    forkId: number,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    super(avmSimulator, globalVariables, contractsDB, forkId, config, undefined, bindings);
    this.log = createLogger(`simulator:public_tx_simulator`, bindings);
  }

  /**
   * Simulate a transaction's public portion.
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
      `Simulating ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}, forkId=${this.forkId}`,
      { txHash },
    );

    // Create the fast simulation inputs.
    const txHint = AvmTxHint.fromTx(tx, this.globalVariables.gasFees);
    const fastSimInputs = new AvmFastSimulationInputs(
      // blockNumber: WorldStateRevision.LATEST sentinel so the WSDB walks the fork's current
      // uncommitted state. Using 0 here makes WSDB treat this as a historical query against
      // the empty genesis tree and miss any in-fork uncommitted leaves (deployed contracts,
      // etc.) from earlier txs in the same block.
      { forkId: this.forkId, blockNumber: WorldStateRevision.LATEST, includeUncommitted: true },
      this.config,
      txHint,
      this.globalVariables,
      this.protocolContracts,
    );

    this.log.trace(`Serializing fast simulation inputs to msgpack...`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    this.log.debug(`Running AVM simulation for tx ${txHash}`);
    const context: AvmContractsDBContext = {
      contractsDB: this.contractsDB,
      forkId: this.forkId,
      timestamp: this.globalVariables.timestamp,
    };
    let resultBuffer: Uint8Array;
    try {
      resultBuffer = await this.avmSimulator.simulate(inputBuffer, context, signal);
    } catch (error: any) {
      if (error.message?.includes('cancelled')) {
        throw new SimulationError(`AVM simulation cancelled`, []);
      }
      throw new SimulationError(`AVM simulation failed: ${error.message}`, []);
    }

    this.log.trace(`Deserializing simulation result from buffer (size: ${resultBuffer.length})...`);
    const resultJSON: object = deserializeFromMessagePack(Buffer.from(resultBuffer));
    const result = PublicTxResult.fromPlainObject(resultJSON);

    this.log.trace(`AVM simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !result.revertCode.isOK(),
      l2GasUsed: result.gasUsed.totalGas.l2Gas,
    });

    return result;
  }

  /**
   * Cancel the current simulation if one is in progress.
   * This signals the underlying simulator to stop at the next safe point (between opcodes, before a
   * world-state write). Safe to call even if no simulation is in progress.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   *                        Cancellation is cooperative: the simulator may be mid slow-operation and
   *                        won't observe the cancellation until it completes.
   *                        Default timeout of 100ms after cancellation.
   */
  public async cancel(waitTimeoutMs: number = 100): Promise<void> {
    if (this.abortController) {
      this.log.debug('Cancelling AVM simulation');
      this.abortController.abort();
    }

    if (this.simulationPromise) {
      this.log.debug(`Waiting up to ${waitTimeoutMs}ms for AVM simulation to stop`);
      await Promise.race([
        this.simulationPromise.catch(() => {}), // Ignore rejection, just wait for completion
        sleep(waitTimeoutMs),
      ]);
      this.log.debug('AVM simulation stopped or wait timed out');
    }
  }
}

export class MeasuredPublicTxSimulator extends PublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    contractsDB: PublicContractsDB,
    forkId: number,
    protected readonly metrics: ExecutorMetricsInterface,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    super(avmSimulator, globalVariables, contractsDB, forkId, config, bindings);
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
 * A public tx simulator that tracks runtime/production metrics with telemetry.
 */
export class TelemetryPublicTxSimulator extends MeasuredPublicTxSimulator {
  /* tracer needed by trackSpans */
  public readonly tracer: Tracer;

  constructor(
    avmSimulator: AvmSimulator,
    globalVariables: GlobalVariables,
    contractsDB: PublicContractsDB,
    forkId: number,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    const metrics = new ExecutorMetrics(telemetryClient, 'PublicTxSimulator');
    super(avmSimulator, globalVariables, contractsDB, forkId, metrics, config, bindings);
    this.tracer = metrics.tracer;
  }
}
