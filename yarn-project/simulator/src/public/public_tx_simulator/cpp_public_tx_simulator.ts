import { type Logger, createLogger } from '@aztec/foundation/log';
import { avmSimulate } from '@aztec/native';
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

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
  ) {
    super(merkleTree, contractsDB, globalVariables, config);
    this.log = createLogger(`simulator:cpp_public_tx_simulator`);
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
    const contractProvider = new ContractProviderForCpp(this.contractsDB, this.globalVariables);

    // Serialize to msgpack and call the C++ simulator
    this.log.trace(`Serializing fast simulation inputs to msgpack...`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      this.log.debug(`Calling C++ simulator for tx ${txHash}`);
      resultBuffer = await avmSimulate(inputBuffer, contractProvider, wsCppHandle);
    } catch (error: any) {
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
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
}

export class MeasuredCppPublicTxSimulator extends CppPublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
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
  ) {
    const metrics = new ExecutorMetrics(telemetryClient, 'CppPublicTxSimulator');
    super(merkleTree, contractsDB, globalVariables, metrics, config);
    this.tracer = metrics.tracer;
  }
}
