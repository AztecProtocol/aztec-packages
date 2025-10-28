import { type Logger, createLogger } from '@aztec/foundation/log';
import { avmSimulateWithHintedDbs } from '@aztec/native';
import { deserializeFromMessagePack } from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';

import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator, type PublicTxSimulatorConfig } from './public_tx_simulator.js';
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
    config?: Partial<PublicTxSimulatorConfig>,
  ) {
    super(merkleTree, contractsDB, globalVariables, config);
    this.log = createLogger(`simulator:cpp_public_tx_simulator_hinted_dbs`);
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

    let tsResult: PublicTxResult;
    try {
      // Run the full TypeScript simulation using the parent class
      // This will modify the merkle tree with the transaction's state changes
      tsResult = await super.simulate(tx);
      this.log.debug(`TS simulation succeeded for tx ${txHash}`);
    } catch (error: any) {
      // If TS simulation fails, clear any partial contract additions and re-throw the error
      this.contractsDB.clearContractsForTx();
      throw error;
    }

    // Extract the full AvmCircuitInputs from the TS result
    const avmCircuitInputs = tsResult.avmProvingRequest.inputs;

    // Second, run C++ simulation with hinted DBs
    this.log.debug(`Running C++ simulation with hinted DBs for tx ${txHash}`);

    // Serialize to msgpack and call the C++ simulator
    const inputBuffer = avmCircuitInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      resultBuffer = await avmSimulateWithHintedDbs(inputBuffer);
    } catch (error: any) {
      throw new SimulationError(`C++ hinted simulation failed: ${error.message}`, []);
    }

    // Deserialize the msgpack result
    const _success = deserializeFromMessagePack<boolean>(resultBuffer);

    this.log.debug(`C++ hinted simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !tsResult.revertCode.isOK(),
      tsGasUsed: tsResult.gasUsed.totalGas.l2Gas,
      cppGasUsed: tsResult.gasUsed.totalGas.l2Gas,
    });

    // TODO(dbanks12): C++ should return PublicTxResult (or something similar)
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
    config?: Partial<PublicTxSimulatorConfig>,
  ) {
    super(merkleTree, contractsDB, globalVariables, config);
  }

  public override async simulate(tx: Tx, txLabel: string = 'unlabeledTx'): Promise<PublicTxResult> {
    this.metrics.startRecordingTxSimulation(txLabel);
    let result: PublicTxResult | undefined;
    try {
      result = await super.simulate(tx);
    } finally {
      this.metrics.stopRecordingTxSimulation(txLabel, result?.revertCode);
    }
    return result;
  }
}
