import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import {
  AvmFastSimulationInputs,
  AvmTxHint,
  PublicSimulatorConfig,
  PublicTxResult,
  deserializeFromMessagePack,
  serializeWithMessagePack,
} from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';
import { WorldStateRevision } from '@aztec/stdlib/world-state';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import type { AvmIpcBackend, AvmSimulatorPool } from '../avm_simulator_pool.js';
import { ExecutorMetrics } from '../executor_metrics.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
  SimulationHandle,
} from './public_tx_simulator_interface.js';

/**
 * IPC-based C++ implementation of PublicTxSimulator.
 * Communicates with an AvmIpcBackend (single process or pool) over IPC.
 * The AVM binary connects directly to WSDB and CDB — no merkle tree
 * or contract DB references needed here. CDB routing uses the fork ID.
 */
export class CppPublicTxSimulator implements PublicTxSimulatorInterface {
  protected log: Logger;

  constructor(
    private avmBackend: AvmIpcBackend,
    private globalVariables: GlobalVariables,
    private config: Partial<PublicSimulatorConfig> = {},
    bindings?: LoggerBindings,
    private wsdbForkId?: number,
  ) {
    this.log = createLogger('simulator:cpp_public_tx_simulator', bindings);
  }

  public simulate(tx: Tx): SimulationHandle {
    // If avmBackend has checkout/return (pool), use per-simulation cancel.
    const pool = this.avmBackend as any;
    if (typeof pool.checkout === 'function') {
      return this.simulateWithPool(tx, pool as AvmSimulatorPool);
    }
    // Single backend path
    const result = this.doSimulate(tx);
    return { result, cancel: async () => {} };
  }

  private simulateWithPool(tx: Tx, pool: AvmSimulatorPool): SimulationHandle {
    const backendPromise = pool.checkout();
    const result = backendPromise.then(b => this.doSimulate(tx, b));
    // Return slot to pool when done (success or error)
    void result
      .finally(() => {
        void backendPromise.then(b => pool.return(b)).catch(() => {});
      })
      .catch(() => {});

    return {
      result,
      cancel: async (waitTimeoutMs = 100) => {
        const b = await backendPromise;
        await b.cancel?.();
        await Promise.race([result.catch(() => {}), sleep(waitTimeoutMs)]);
      },
    };
  }

  protected async doSimulate(tx: Tx, backend?: AvmIpcBackend): Promise<PublicTxResult> {
    const effectiveBackend = backend ?? this.avmBackend;
    const txHash = tx.getTxHash();
    this.log.debug(`IPC simulation for tx ${txHash}, wsdbForkId=${this.wsdbForkId ?? 0}`);

    const txHint = AvmTxHint.fromTx(tx, this.globalVariables.gasFees);
    const protocolContracts = ProtocolContractsList;
    const fastSimInputs = new AvmFastSimulationInputs(
      // blockNumber: WorldStateRevision.LATEST sentinel so the WSDB walks the fork's current
      // uncommitted state. Using 0 here makes WSDB treat this as a historical query against
      // the empty genesis tree and miss any in-fork uncommitted leaves (deployed contracts,
      // etc.) from earlier txs in the same block.
      { forkId: this.wsdbForkId ?? 0, blockNumber: WorldStateRevision.LATEST, includeUncommitted: true },
      PublicSimulatorConfig.from(this.config ?? {}),
      txHint,
      this.globalVariables,
      protocolContracts,
    );

    const inputBuffer = fastSimInputs.serializeWithMessagePack();
    const wrappedCommand = serializeWithMessagePack([['AvmSimulate', { inputs: inputBuffer }]]);

    let resultBuffer: Uint8Array;
    try {
      resultBuffer = await effectiveBackend.call(wrappedCommand);
    } catch (error: any) {
      throw new SimulationError(`IPC AVM simulation failed: ${error.message}`, []);
    }

    const responseObj: any = deserializeFromMessagePack(Buffer.from(resultBuffer));

    if (Array.isArray(responseObj) && responseObj.length === 2) {
      const [name, payload] = responseObj;
      if (name === 'AvmErrorResponse') {
        throw new SimulationError(`AVM error: ${payload.message}`, []);
      }
      if (name === 'AvmSimulateResponse' && payload.result) {
        const resultBytes = Buffer.from(payload.result);
        const cppResultJSON: object = deserializeFromMessagePack(resultBytes);
        return PublicTxResult.fromPlainObject(cppResultJSON);
      }
    }

    throw new SimulationError('Unexpected response format from aztec-avm', []);
  }
}

/** C++ public tx simulator with metrics recording. */
export class MeasuredCppPublicTxSimulator extends CppPublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
  constructor(
    avmBackend: AvmIpcBackend,
    globalVariables: GlobalVariables,
    protected readonly metrics: ExecutorMetricsInterface,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(avmBackend, globalVariables, config, bindings, wsdbForkId);
  }

  public override simulate(tx: Tx, txLabel: string = 'unlabeledTx'): SimulationHandle {
    const handle = super.simulate(tx);
    this.metrics.startRecordingTxSimulation(txLabel);
    const result = handle.result
      .then(r => {
        this.metrics.stopRecordingTxSimulation(txLabel, r?.gasUsed, r?.revertCode);
        return r;
      })
      .catch(err => {
        this.metrics.stopRecordingTxSimulation(txLabel, undefined, undefined);
        throw err;
      });
    return { result, cancel: handle.cancel };
  }
}

/** C++ public tx simulator with telemetry. */
export class TelemetryCppPublicTxSimulator extends MeasuredCppPublicTxSimulator {
  public readonly tracer: Tracer;

  constructor(
    avmBackend: AvmIpcBackend,
    globalVariables: GlobalVariables,
    telemetryClient: TelemetryClient = getTelemetryClient(),
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    const metrics = new ExecutorMetrics(telemetryClient, 'CppPublicTxSimulator');
    super(avmBackend, globalVariables, metrics, config, bindings, wsdbForkId);
    this.tracer = metrics.tracer;
  }
}
