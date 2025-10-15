import { type Logger, createLogger } from '@aztec/foundation/log';
import { avmSimulate } from '@aztec/native';
import { AvmCircuitPublicInputs, AvmFastSimulationInputs, deserializeFromMessagePack } from '@aztec/stdlib/avm';
import { SimulationError } from '@aztec/stdlib/errors';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, Tx } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator, type PublicTxSimulatorConfig } from './public_tx_simulator.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
} from './public_tx_simulator_interface.js';

/**
 * C++ implementation of PublicTxSimulator using the fast vm2 simulator.
 * This implementation collects hints in TypeScript and then calls the C++ simulator
 * which runs the entire transaction simulation natively.
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
   * Simulate a transaction's public portion using the C++ vm2 simulator.
   *
   * TRANSITION PHASE APPROACH:
   * This implementation uses a two-phase strategy to validate C++ simulation results:
   * 1. First, run the full TypeScript simulation to generate hints and public inputs
   * 2. Then, rollback state and re-run using C++ fast simulation with the TS-generated hints
   *
   * This ensures we can validate that C++ produces the same results as TypeScript
   * before fully transitioning to C++-only simulation.
   *
   * @param tx - The transaction to simulate.
   * @returns The result of the transaction's public execution.
   */
  public override async simulate(tx: Tx): Promise<PublicTxResult> {
    const txHash = this.computeTxHash(tx);
    this.log.debug(`C++ simulation (two-phase) of ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}`, {
      txHash,
    });

    // ========================================================================
    // PHASE 1: Run TypeScript simulation to generate hints and public inputs
    // ========================================================================
    this.log.debug(`Phase 1: Running TypeScript simulation for tx ${txHash}`);

    // Create a checkpoint for the merkle tree so we can rollback after TS simulation
    await this.merkleTree.createCheckpoint();

    let tsResult: PublicTxResult;
    try {
      // Run the full TypeScript simulation using the parent class
      tsResult = await super.simulate(tx);
      this.log.debug(`Phase 1 complete: TS simulation succeeded for tx ${txHash}`);
    } catch (error: any) {
      // If TS simulation fails, rollback the checkpoint and propagate the error
      await this.merkleTree.revertCheckpoint();
      this.contractsDB.clearContractsForTx();
      throw error;
    }

    // Extract hints and public inputs from the TS simulation result
    const hints = tsResult.avmProvingRequest.inputs.hints;
    const publicInputs = tsResult.avmProvingRequest.inputs.publicInputs;

    // ========================================================================
    // PHASE 2: Rollback state and run C++ fast simulation
    // ========================================================================
    this.log.debug(`Phase 2: Rolling back state and running C++ simulation for tx ${txHash}`);

    // Rollback the merkle tree to pre-simulation state
    await this.merkleTree.revertCheckpoint();

    // Rollback the contracts DB to pre-simulation state
    this.contractsDB.clearContractsForTx();

    // Get the world state revision to pass to C++ so that we know it's operating on the same WS revision as TS.
    const wsRevision = this.merkleTree.getRevision();
    this.log.debug(`Using world state revision ${JSON.stringify(wsRevision)} for C++ simulation`);

    // Create the fast simulation inputs with the hints and public inputs from TS
    const fastSimInputs = new AvmFastSimulationInputs(hints, publicInputs, wsRevision);

    // Serialize to msgpack and call the C++ simulator
    this.log.debug(`Calling C++ simulator for tx ${txHash}`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      resultBuffer = await avmSimulate(inputBuffer);
    } catch (error: any) {
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    }

    // Deserialize the msgpack result (which is the updated PublicInputs with outputs filled)
    // The deserializeFromMessagePack function uses msgpack extensions to properly reconstruct
    // TypeScript class instances (Fr, AztecAddress, etc.) from the C++ msgpack data
    const cppPublicInputs = deserializeFromMessagePack<AvmCircuitPublicInputs>(resultBuffer);

    // Just confirm that the TS and C++ simulation results are the same
    // First, gas.
    assert(
      tsResult.gasUsed.totalGas.equals(cppPublicInputs.endGasUsed),
      `TS and C++ simulation gas used do not match: ${JSON.stringify(tsResult.gasUsed.totalGas)} !== ${JSON.stringify(cppPublicInputs.endGasUsed)}`,
    );

    // Commit contracts from this TX to the block-level cache
    // Note: We re-add contracts since we rolled back the contracts DB
    // WARNING: These really should happen inside C++ simulation after the respective phases.
    // Otherwise a transaction cannot register/deploy a contract in private and execute it in public.
    await this.contractsDB.addNewNonRevertibleContracts(tx);
    if (cppPublicInputs.reverted) {
      await this.contractsDB.addNewRevertibleContracts(tx);
    }
    this.contractsDB.commitContractsForTx(/*onlyNonRevertibles=*/ !cppPublicInputs.reverted);

    this.log.debug(`Phase 2 complete: C++ simulation completed for tx ${txHash}`, {
      txHash,
      reverted: cppPublicInputs.reverted,
      tsGasUsed: tsResult.gasUsed.totalGas.l2Gas,
      cppGasUsed: cppPublicInputs.endGasUsed.l2Gas,
    });

    // TODO(dbanks12): Should this PublicTxResult just be the struct returned by C++ simulation?
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
