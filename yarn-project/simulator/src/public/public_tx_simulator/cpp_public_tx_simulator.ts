import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
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
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { ExecutorMetrics } from '../executor_metrics.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
} from './public_tx_simulator_interface.js';

/** Msgpack IPC backend interface (matches bb.js IMsgpackBackendAsync). */
export interface AvmIpcBackend {
  call(inputBuffer: Uint8Array): Promise<Uint8Array>;
  cancel?(): Promise<void>;
  destroy?(): Promise<void>;
}

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

  public async simulate(tx: Tx): Promise<PublicTxResult> {
    const txHash = tx.getTxHash();
    this.log.debug(`IPC simulation for tx ${txHash}, wsdbForkId=${this.wsdbForkId ?? 0}`);

    const txHint = AvmTxHint.fromTx(tx, this.globalVariables.gasFees);
    const protocolContracts = ProtocolContractsList;
    const fastSimInputs = new AvmFastSimulationInputs(
      { forkId: this.wsdbForkId ?? 0, blockNumber: 0, includeUncommitted: true },
      PublicSimulatorConfig.from(this.config ?? {}),
      txHint,
      this.globalVariables,
      protocolContracts,
    );

    const inputBuffer = fastSimInputs.serializeWithMessagePack();
    const wrappedCommand = serializeWithMessagePack([['AvmSimulate', { inputs: inputBuffer }]]);

    let resultBuffer: Uint8Array;
    try {
      resultBuffer = await this.avmBackend.call(wrappedCommand);
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

  public async cancel(_waitTimeoutMs: number = 100): Promise<void> {
    this.log.debug('Cancelling IPC simulation');
    await this.avmBackend.cancel?.();
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
