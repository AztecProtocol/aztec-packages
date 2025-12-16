import { type Logger, createLogger } from '@aztec/foundation/log';
import { avmSimulate, avmSimulateWithHintedDbs } from '@aztec/native';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import {
  AvmCircuitInputs,
  AvmFastSimulationInputs,
  AvmTxHint,
  PublicTxResult,
  type PublicTxSimulatorConfig,
  deserializeFromMessagePack,
} from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';
import { WorldStateRevisionWithHandle } from '@aztec/stdlib/world-state';

import { strict as assert } from 'assert';

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
 *
 * TODO(dbanks12): for now this still simulates first in TS to generate hints and public inputs,
 * since the C++ simulator doesn't have hinting & PI generation logic yet.
 */
export class CppPublicTxSimulator extends PublicTxSimulator implements PublicTxSimulatorInterface {
  protected override log: Logger;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config?: Partial<PublicTxSimulatorConfig>,
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

    // TODO(dbanks12): remove the first run with TS that hints!
    // Run TS simulation to generate hints and public inputs
    this.log.debug(`Running TS simulation for tx ${txHash}`);

    // create checkpoint for ws
    let tsResult: PublicTxResult | undefined;
    let tsStateRef: StateReference | undefined;
    await this.merkleTree.createCheckpoint();
    this.contractsDB.createCheckpoint();
    try {
      // Run the full TypeScript simulation using the parent class
      // This will modify the merkle tree with the transaction's state changes
      tsResult = await super.simulate(tx);
      this.log.debug(`TS simulation completed for tx ${txHash}`);

      tsStateRef = await this.merkleTree.getStateReference(); // capture tree roots for later comparsion
    } catch (error: any) {
      this.log.warn(`TS simulation failed, but still continuing with C++ simulation: ${error.message} ${error.stack}`);
    } finally {
      // revert checkpoint for ws and clear contract db changes
      // (cpp should reapply exactly the same changes if there are no bugs)
      await this.merkleTree.revertCheckpoint();
      this.contractsDB.revertCheckpoint();
    }

    this.log.debug(`Running C++ simulation for tx ${txHash}`);

    // Using the "as WorldStateRevisionWithHandle" is a bit of a "trust me bro", hence the assert.
    let wsRevision = this.merkleTree.getRevision();
    assert(
      wsRevision instanceof WorldStateRevisionWithHandle,
      'CppPublicTxSimulator a real NativeWorldStateInstance with a handle to the C++ WorldState object',
    );
    const wsCppHandle = (wsRevision as WorldStateRevisionWithHandle).handle;
    wsRevision = wsRevision.toWorldStateRevision(); // for msgpack serialization, we don't include the handle in the type

    this.log.debug(`Running C++ simulation with world state revision ${JSON.stringify(wsRevision)}`);

    // Create the fast simulation inputs
    const txHint = AvmTxHint.fromTx(tx, this.globalVariables.gasFees);
    const protocolContracts = ProtocolContractsList;
    const fastSimInputs = new AvmFastSimulationInputs(wsRevision, txHint, this.globalVariables, protocolContracts);

    // Create contract provider for callbacks to TypeScript PublicContractsDB from C++
    const contractProvider = new ContractProviderForCpp(this.contractsDB, this.globalVariables);

    // Serialize to msgpack and call the C++ simulator
    this.log.verbose(`Serializing fast simulation inputs to msgpack...`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      this.log.verbose(`Calling C++ simulator for tx ${txHash}`);
      resultBuffer = await avmSimulate(inputBuffer, contractProvider, wsCppHandle);
    } catch (error: any) {
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    }

    // If we've reached this point, C++ succeeded during simulation,
    // so we assert that TS also succeeded.
    assert(tsResult !== undefined, 'TS simulation should have succeeded if C++ succeeded');
    assert(tsStateRef !== undefined, 'TS state reference should have been captured if C++ succeeded');

    // Deserialize the msgpack result
    this.log.verbose(`Deserializing C++ from buffer (size: ${resultBuffer.length})...`);
    const cppResultJSON: object = deserializeFromMessagePack(resultBuffer);
    this.log.verbose(`Deserializing C++ result to PublicTxResult...`);
    const cppResult = PublicTxResult.schema.parse(cppResultJSON);
    this.log.verbose(`Done.`);
    // TODO(fcarreiro): complete this.
    assert(cppResult.revertCode.equals(tsResult.revertCode));
    assert(cppResult.gasUsed.totalGas.equals(tsResult.gasUsed.totalGas));

    // Confirm that tree roots match
    const cppStateRef = await this.merkleTree.getStateReference();
    assert(
      cppStateRef.equals(tsStateRef),
      `Tree roots mismatch between TS and C++ public simulations for tx ${txHash}`,
    );

    this.log.debug(`C++ simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !tsResult.revertCode.isOK(),
      tsGasUsed: tsResult.gasUsed.totalGas.l2Gas,
      cppGasUsed: tsResult.gasUsed.totalGas.l2Gas,
    });

    // TODO(dbanks12): C++ should return PublicTxResult (or something similar)
    return tsResult;
  }
}

export class MeasuredCppPublicTxSimulator extends CppPublicTxSimulator implements MeasuredPublicTxSimulatorInterface {
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

    // Run the full TypeScript simulation using the parent class
    // This will modify the merkle tree with the transaction's state changes
    const tsResult = await super.simulate(tx);
    this.log.debug(`TS simulation succeeded for tx ${txHash}`);

    // Extract the full AvmCircuitInputs from the TS result
    const avmCircuitInputs = new AvmCircuitInputs(tsResult.hints!, tsResult.publicInputs);

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
    const cppResultJSON: object = deserializeFromMessagePack(resultBuffer);
    const cppResult = PublicTxResult.schema.parse(cppResultJSON);

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
