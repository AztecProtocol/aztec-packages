import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type ContractProvider, avmSimulate, avmSimulateWithHintedDbs } from '@aztec/native';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AvmFastSimulationInputs, deserializeFromMessagePack, serializeWithMessagePack } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ContractDeploymentData } from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { ContractClassLog, ContractClassLogFields, PrivateLog } from '@aztec/stdlib/logs';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';
import { WorldStateRevisionWithHandle } from '@aztec/stdlib/world-state';

import { strict as assert } from 'assert';

import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { type PublicTxResult, PublicTxSimulator, type PublicTxSimulatorConfig } from './public_tx_simulator.js';
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
    let tsResult: PublicTxResult;
    let tsStateRef: StateReference;
    await this.merkleTree.createCheckpoint();
    try {
      // Run the full TypeScript simulation using the parent class
      // This will modify the merkle tree with the transaction's state changes
      tsResult = await super.simulate(tx);
      this.log.debug(`TS simulation completed for tx ${txHash}`);

      tsStateRef = await this.merkleTree.getStateReference(); // capture tree roots for later comparsion
    } finally {
      // revert checkpoint for ws and clear contract db changes
      // (cpp should reapply exactly the same changes if there are no bugs)
      await this.merkleTree.revertCheckpoint();
      this.contractsDB.clearContractsForTx();
    }

    const hints = tsResult.avmProvingRequest.inputs.hints;

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
    const fastSimInputs = new AvmFastSimulationInputs(
      wsRevision,
      hints.tx,
      this.globalVariables,
      hints.protocolContracts,
    );

    // Create contract provider for callbacks to TypeScript
    // Note: Currently this is a stub implementation. The C++ simulator uses hints from the inputs.
    // Future work: When C++ simulation helper is refactored to support runtime contract DB injection,
    // these callbacks will be invoked during simulation instead of using pre-loaded hints.
    const contractProvider = this.createContractProvider();

    // Serialize to msgpack and call the C++ simulator
    this.log.debug(`Calling C++ simulator for tx ${txHash}`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();
    this.log.debug(`Serialized ${inputBuffer.length} bytes for C++ simulator`);

    let resultBuffer: Buffer;
    try {
      resultBuffer = await avmSimulate(inputBuffer, contractProvider, wsCppHandle);
    } catch (error: any) {
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    }

    // Deserialize the msgpack result
    const _success = deserializeFromMessagePack<boolean>(resultBuffer);

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

  /**
   * Creates a contract provider that wraps the PublicContractsDB with callbacks
   * for fetching contract instances and classes during C++ simulation.
   *
   * Note: This is currently a stub implementation. The C++ simulator uses hints
   * from AvmFastSimulationInputs instead of calling back to TypeScript at runtime.
   * These callbacks will be activated in a future phase when simulation_helper.cpp
   * is refactored to support runtime ContractDBInterface injection.
   */
  private createContractProvider(): ContractProvider {
    return {
      getContractInstance: async (address: string) => {
        this.log.debug(`Contract provider callback: getContractInstance(${address})`);

        // Parse address string to AztecAddress
        // The address comes from C++ as a hex string
        const aztecAddr = this.parseAddress(address);

        // Fetch contract instance from the contracts DB
        // Note: We use the current global timestamp. In the future, this might need
        // to be passed from C++ if historical lookups are needed.
        const instance = await this.contractsDB.getContractInstance(aztecAddr, this.globalVariables.timestamp);

        if (!instance) {
          this.log.debug(`Contract instance not found: ${address}`);
          // TODO(dbanks12): will NAPI return this gracefully to C++?
          return undefined;
        }

        return serializeWithMessagePack(instance);
      },

      getContractClass: async (classId: string) => {
        this.log.debug(`Contract provider callback: getContractClass(${classId})`);

        // Parse classId string to Fr
        const classIdFr = this.parseFr(classId);

        // Fetch contract class from the contracts DB
        const contractClass = await this.contractsDB.getContractClass(classIdFr);

        if (!contractClass) {
          this.log.debug(`Contract class not found: ${classId}`);
          // TODO(dbanks12): will NAPI return this gracefully to C++?
          return undefined;
        }

        return serializeWithMessagePack(contractClass);
      },

      addNewNonRevertibleContracts: async (nonRevertibleContractDeploymentDataBuffer: Buffer) => {
        this.log.debug(`Contract provider callback: addNewNonRevertibleContracts`);

        const rawData = deserializeFromMessagePack<any>(nonRevertibleContractDeploymentDataBuffer);

        // Construct class instances using the from method
        const nonRevertibleContractDeploymentData = this.reconstructContractDeploymentData(rawData);

        // Add non-revertible contracts to the contracts DB
        this.log.debug(`Calling contractsDB.addNewNonRevertibleContracts`);
        await this.contractsDB.addNewNonRevertibleContracts(nonRevertibleContractDeploymentData);
      },

      addNewRevertibleContracts: async (revertibleContractDeploymentDataBuffer: Buffer) => {
        this.log.debug(`Contract provider callback: addNewRevertibleContracts`);

        const rawData = deserializeFromMessagePack<any>(revertibleContractDeploymentDataBuffer);

        // Construct class instances using the from method
        const revertibleContractDeploymentData = this.reconstructContractDeploymentData(rawData);

        // Add revertible contracts to the contracts DB
        this.log.debug(`Calling contractsDB.addNewRevertibleContracts`);
        await this.contractsDB.addNewRevertibleContracts(revertibleContractDeploymentData);
      },

      getBytecodeCommitment: async (classId: string) => {
        this.log.debug(`Contract provider callback: getBytecodeCommitment(${classId})`);

        // Parse classId string to Fr
        const classIdFr = this.parseFr(classId);

        // Fetch bytecode commitment from the contracts DB
        const commitment = await this.contractsDB.getBytecodeCommitment(classIdFr);

        if (!commitment) {
          this.log.debug(`Bytecode commitment not found: ${classId}`);
          // TODO(dbanks12): will NAPI return this gracefully to C++?
          return undefined;
        }

        // Serialize the Fr to buffer
        return serializeWithMessagePack(commitment);
      },

      getDebugFunctionName: async (address: string, selector: string) => {
        this.log.debug(`Contract provider callback: getDebugFunctionName(${address}, ${selector})`);

        // Parse address and selector strings
        const aztecAddr = this.parseAddress(address);
        const selectorFr = this.parseFr(selector);
        const functionSelector = FunctionSelector.fromField(selectorFr);

        // Fetch debug function name from the contracts DB
        const name = await this.contractsDB.getDebugFunctionName(aztecAddr, functionSelector);

        if (!name) {
          this.log.debug(`Debug function name not found for ${address}:${selector}`);
          return undefined;
        }

        return name;
      },
    };
  }

  /**
   * Reconstruct ContractDeploymentData from plain msgpack-deserialized objects.
   * msgpackr does not automatically apply extensions to nested fields, so we need to
   * manually reconstruct ContractClassLog and PrivateLog instances with proper types.
   */
  private reconstructContractDeploymentData(rawData: any): ContractDeploymentData {
    // Helper to ensure a value is an Fr instance
    const toFr = (value: any): Fr => {
      if (value instanceof Fr) {
        return value;
      }
      if (Buffer.isBuffer(value)) {
        return Fr.fromBuffer(value);
      }
      return new Fr(value);
    };

    // Reconstruct ContractClassLogs
    const contractClassLogs = (rawData.contractClassLogs || []).map((log: any) => {
      // Convert contractAddress to AztecAddress
      const addressFr = toFr(log.contractAddress);
      const address = AztecAddress.fromField(addressFr);

      // Ensure all fields are Fr instances
      const fields = (log.fields.fields || []).map((field: any) => toFr(field));

      // Create proper ContractClassLog instance
      return new ContractClassLog(address, new ContractClassLogFields(fields), log.emittedLength);
    });

    // Reconstruct PrivateLogs - ensure fields are Fr instances
    const privateLogs = (rawData.privateLogs || []).map((log: any) => {
      const fields = (log.fields || []).map((field: any) => toFr(field));
      return new PrivateLog(fields as any, log.emittedLength);
    });

    return new ContractDeploymentData(contractClassLogs, privateLogs);
  }

  /**
   * Parse an address string (hex format) to AztecAddress.
   * Handles various hex string formats (with or without 0x prefix).
   */
  private parseAddress(addressStr: string): AztecAddress {
    try {
      return AztecAddress.fromString(addressStr);
    } catch (error) {
      throw new Error(`Failed to parse address string "${addressStr}": ${error}`);
    }
  }

  /**
   * Parse a Fr string (hex format) to Fr instance.
   * Handles various hex string formats (with or without 0x prefix).
   */
  private parseFr(frStr: string): Fr {
    try {
      return Fr.fromString(frStr);
    } catch (error) {
      throw new Error(`Failed to parse Fr string "${frStr}": ${error}`);
    }
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
