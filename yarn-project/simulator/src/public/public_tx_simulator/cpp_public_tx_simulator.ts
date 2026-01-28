import { type Logger, type LoggerBindings, createLogger, logLevel } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { type CancellationToken, avmSimulate, cancelSimulation, createCancellationToken } from '@aztec/native';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import {
  AvmFastSimulationInputs,
  AvmTxHint,
  type PublicSimulatorConfig,
  PublicTxResult,
  deserializeFromMessagePack,
} from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';
import { WorldStateRevisionWithHandle } from '@aztec/stdlib/world-state';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { strict as assert } from 'assert';

import { ExecutorMetrics } from '../executor_metrics.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { ContractProviderForCpp } from './contract_provider_for_cpp.js';
import { PublicTxSimulator } from './public_tx_simulator.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
} from './public_tx_simulator_interface.js';

/**
 * C++ implementation of PublicTxSimulator using the C++ simulator.
 * The C++ simulator accesses the world state directly/natively within C++.
 * For contract DB accesses, it makes callbacks through NAPI back to the TS PublicContractsDB cache.
 */
export class CppPublicTxSimulator extends PublicTxSimulator implements PublicTxSimulatorInterface {
  protected override log: Logger;
  /** Current cancellation token for in-flight simulation. */
  private cancellationToken?: CancellationToken;
  /** Current simulation promise, used to wait for completion after cancellation. */
  private simulationPromise?: Promise<Buffer>;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    super(merkleTree, contractsDB, globalVariables, config, undefined, bindings);
    this.log = createLogger(`simulator:cpp_public_tx_simulator`, bindings);
  }

  /**
   * Simulate a transaction's public portion using the C++ avvm simulator.
   *
   * @param tx - The transaction to simulate.
   * @returns The result of the transaction's public execution.
   */
  public override async simulate(tx: Tx): Promise<PublicTxResult> {
    const txHash = this.computeTxHash(tx);
    this.log.debug(`C++ simulation of ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}`, {
      txHash,
    });

    // Using the "as WorldStateRevisionWithHandle" is a bit of a "trust me bro", hence the assert.
    let wsRevision = this.merkleTree.getRevision();
    assert(
      wsRevision instanceof WorldStateRevisionWithHandle,
      'CppPublicTxSimulator a real NativeWorldStateInstance with a handle to the C++ WorldState object',
    );
    const wsCppHandle = (wsRevision as WorldStateRevisionWithHandle).handle;
    wsRevision = wsRevision.toWorldStateRevision(); // for msgpack serialization, we don't include the handle in the type

    this.log.trace(`Running C++ simulation with world state revision ${JSON.stringify(wsRevision)}`);

    // Create the fast simulation inputs
    const txHint = AvmTxHint.fromTx(tx, this.globalVariables.gasFees);
    const protocolContracts = ProtocolContractsList;
    const fastSimInputs = new AvmFastSimulationInputs(
      wsRevision,
      this.config,
      txHint,
      this.globalVariables,
      protocolContracts,
    );

    // Create contract provider for callbacks to TypeScript PublicContractsDB from C++
    const contractProvider = new ContractProviderForCpp(this.contractsDB, this.globalVariables, this.bindings);

    // Serialize to msgpack and call the C++ simulator
    this.log.trace(`Serializing fast simulation inputs to msgpack...`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    // Create cancellation token for this simulation
    this.cancellationToken = createCancellationToken();

    // Store the promise so cancel() can wait for it
    this.log.debug(`Calling C++ simulator for tx ${txHash}`);
    this.simulationPromise = avmSimulate(
      inputBuffer,
      contractProvider,
      wsCppHandle,
      logLevel,
      // TODO: re-enable logging
      undefined,
      this.cancellationToken,
    );

    let resultBuffer: Buffer;
    try {
      resultBuffer = await this.simulationPromise;
    } catch (error: any) {
      // Check if this was a cancellation
      if (error.message?.includes('Simulation cancelled')) {
        throw new SimulationError(`C++ simulation cancelled`, []);
      }
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    } finally {
      this.cancellationToken = undefined;
      this.simulationPromise = undefined;
    }

    // If we've reached this point, C++ succeeded during simulation,

    // Deserialize the msgpack result
    this.log.trace(`Deserializing C++ from buffer (size: ${resultBuffer.length})...`);
    const cppResultJSON: object = deserializeFromMessagePack(resultBuffer);
    this.log.trace(`Deserializing C++ result to PublicTxResult...`);
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
   * This signals the C++ simulator to stop at the next opcode or before the next WorldState write.
   * Safe to call even if no simulation is in progress.
   *
   * @param waitTimeoutMs - If provided, wait up to this many ms for the simulation to actually stop.
   *                        This is important because C++ might be in the middle of a slow operation
   *                        (e.g., pad_trees) and won't check the cancellation flag until it completes.
   *                        Default timeout of 100ms after cancellation.
   */
  public async cancel(waitTimeoutMs: number = 100): Promise<void> {
    if (this.cancellationToken) {
      this.log.debug('Cancelling C++ simulation');
      cancelSimulation(this.cancellationToken);
    }

    // Wait for the simulation to actually complete if not already done
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

export class MeasuredCppPublicTxSimulator extends CppPublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    protected readonly metrics: ExecutorMetricsInterface,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    super(merkleTree, contractsDB, globalVariables, config, bindings);
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
export class TelemetryCppPublicTxSimulator extends MeasuredCppPublicTxSimulator {
  /* tracer needed by trackSpans */
  public readonly tracer: Tracer;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    const metrics = new ExecutorMetrics(telemetryClient, 'CppPublicTxSimulator');
    super(merkleTree, contractsDB, globalVariables, metrics, config, bindings);
    this.tracer = metrics.tracer;
  }
}
