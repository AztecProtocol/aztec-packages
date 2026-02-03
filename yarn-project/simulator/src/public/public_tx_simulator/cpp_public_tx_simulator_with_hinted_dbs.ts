import { type Logger, type LoggerBindings, createLogger, logLevel } from '@aztec/foundation/log';
import { avmSimulateWithHintedDbs } from '@aztec/native';
import {
  AvmCircuitInputs,
  type PublicSimulatorConfig,
  PublicTxResult,
  deserializeFromMessagePack,
} from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { PublicTxSimulator } from './public_tx_simulator.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
} from './public_tx_simulator_interface.js';

/**
 * C++ implementation of PublicTxSimulator using pre-collected hints.
 * This implementation runs TS simulation first to collect all hints,
 * then passes the complete AvmCircuitInputs (hints + public inputs)
 * to C++ to run hinted simulation.
 */
export class CppPublicTxSimulatorHintedDbs extends PublicTxSimulator implements PublicTxSimulatorInterface {
  protected override log: Logger;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    super(merkleTree, contractsDB, globalVariables, config, undefined, bindings);
    this.log = createLogger(`simulator:cpp_public_tx_simulator_hinted_dbs`, bindings);
  }

  /**
   * Simulate a transaction's public portion using the C++ vm2 simulator with hinted DBs.
   *
   * This implementation:
   * 1. Runs the full TypeScript simulation to generate AvmCircuitInputs (hints + public inputs)
   * 2. Passes the complete AvmCircuitInputs to C++ to run hinted simulation
   *
   * @param tx - The transaction to simulate.
   * @returns The result of the transaction's public execution.
   */
  public override async simulate(tx: Tx): Promise<PublicTxResult> {
    const txHash = this.computeTxHash(tx);
    this.log.debug(`C++ hinted DB simulation of ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}`, {
      txHash,
    });

    // First, run TS simulation to generate hints and public inputs
    this.log.debug(`Running TS simulation for tx ${txHash}`);

    // Run the full TypeScript simulation using the parent class
    // This will modify the merkle tree with the transaction's state changes
    const tsResult = await super.simulate(tx);
    this.log.debug(`TS simulation succeeded for tx ${txHash}`);

    // Extract the full AvmCircuitInputs from the TS result
    const avmCircuitInputs = new AvmCircuitInputs(tsResult.hints!, tsResult.publicInputs!);

    // Second, run C++ simulation with hinted DBs
    this.log.debug(`Running C++ simulation with hinted DBs for tx ${txHash}`);

    // Serialize to msgpack and call the C++ simulator
    const inputBuffer = avmCircuitInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      resultBuffer = await avmSimulateWithHintedDbs(inputBuffer, logLevel);
    } catch (error: any) {
      throw new SimulationError(`C++ hinted simulation failed: ${error.message}`, []);
    }

    // Deserialize the msgpack result
    const cppResultJSON: object = deserializeFromMessagePack(resultBuffer);
    const cppResult = PublicTxResult.fromPlainObject(cppResultJSON);

    assert(cppResult.revertCode.equals(tsResult.revertCode));
    assert(cppResult.gasUsed.totalGas.equals(tsResult.gasUsed.totalGas));

    this.log.debug(`C++ hinted simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !tsResult.revertCode.isOK(),
      tsGasUsed: tsResult.gasUsed.totalGas.l2Gas,
      cppGasUsed: tsResult.gasUsed.totalGas.l2Gas,
    });

    // TODO(fcarreiro): complete this.
    return tsResult;
  }
}

/**
 * Class to record metrics for simulation.
 *
 * Note(dbanks12): We might not be able to collect all the same metrics in C++ as we do in TS!
 * Unless we move some of the metrics collection to C++, we don't have inner functions exposed
 * to TS for tracking.
 */
export class MeasuredCppPublicTxSimulatorHintedDbs
  extends CppPublicTxSimulatorHintedDbs
  implements MeasuredPublicTxSimulatorInterface
{
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
