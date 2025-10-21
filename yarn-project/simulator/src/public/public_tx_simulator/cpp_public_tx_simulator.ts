import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type ContractProvider, avmSimulate, avmSimulateWithHintedDbs } from '@aztec/native';
import { AvmFastSimulationInputs, deserializeFromMessagePack, serializeWithMessagePack } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
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
   * 2. Then, run C++ fast simulation with the TS-generated hints for validation (read-only)
   *
   * This ensures we can validate that C++ produces the same results as TypeScript
   * before fully transitioning to C++-only simulation.
   *
   * NOTE: C++ fast simulation currently only validates computation - it does not write to
   * world state. TS simulation writes remain in place for subsequent transactions.
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

    // create checkpoint for ws
    await this.merkleTree.createCheckpoint();
    let tsResult: PublicTxResult;
    try {
      // Run the full TypeScript simulation using the parent class
      // This will modify the merkle tree with the transaction's state changes
      tsResult = await super.simulate(tx);
      this.log.debug(`Phase 1 complete: TS simulation succeeded for tx ${txHash}`);
    } catch (error: any) {
      // If TS simulation fails, clear any partial contract additions and propagate the error
      this.contractsDB.clearContractsForTx();
      throw error;
    }

    // revert checkpoint for ws
    await this.merkleTree.revertCheckpoint();

    const hints = tsResult.avmProvingRequest.inputs.hints;

    // ========================================================================
    // PHASE 2: Run C++ fast simulation for validation
    // ========================================================================
    this.log.debug(`Phase 2: Running C++ simulation for validation for tx ${txHash}`);

    // Capture the world state revision AFTER TS simulation completes.
    // C++ will read from this state (which includes TS writes and all previous committed state).
    const wsRevision = this.merkleTree.getRevision();
    this.log.debug(`Using post-TS world state revision ${JSON.stringify(wsRevision)} for C++ simulation`);

    // Create the fast simulation inputs with the hints and public inputs from TS
    // The wsRevision captured above is the pre-transaction state
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

    // Extract WorldState handle from MerkleTreeWriteOperations
    const worldStateHandle = this.extractWorldStateHandle();

    // Serialize to msgpack and call the C++ simulator
    this.log.debug(`Calling C++ simulator for tx ${txHash}`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      resultBuffer = await avmSimulate(inputBuffer, contractProvider, worldStateHandle);
    } catch (error: any) {
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    }

    // Deserialize the msgpack result
    const _success = deserializeFromMessagePack<boolean>(resultBuffer);

    this.log.debug(`Phase 2 complete: C++ simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !tsResult.revertCode.isOK(),
      tsGasUsed: tsResult.gasUsed.totalGas.l2Gas,
      cppGasUsed: tsResult.gasUsed.totalGas.l2Gas,
    });

    // TODO(dbanks12): Should this PublicTxResult just be the struct returned by C++ simulation?
    return tsResult;
  }

  /**
   * Extracts the native WorldState handle from MerkleTreeWriteOperations.
   * The merkleTree is a MerkleTreesForkFacade which wraps a NativeWorldState instance.
   * We call the getHandle() method on the native WorldState to get a NAPI External
   * that wraps the underlying C++ WorldState pointer.
   */
  private extractWorldStateHandle(): any {
    // The merkleTree is a MerkleTreesForkFacade which has an 'instance' property
    // that is a NativeWorldState which wraps a MsgpackChannel
    const facade = this.merkleTree as any;
    if (!facade.instance) {
      throw new Error('No native WorldState instance found in MerkleTreeWriteOperations');
    }
    // The instance is a NativeWorldState which has an 'instance' property (MsgpackChannel)
    const nativeWorldState = facade.instance;
    if (!nativeWorldState.instance) {
      throw new Error('No MsgpackChannel instance found in NativeWorldState');
    }
    const msgpackChannel = nativeWorldState.instance;
    // The msgpackChannel has a 'dest' property which is the WorldStateWrapper NAPI object
    // Call getHandle() on it to get the NAPI External wrapping the WorldState pointer
    const worldStateWrapper = (msgpackChannel as any).dest;
    if (!worldStateWrapper) {
      throw new Error('No WorldStateWrapper found in MsgpackChannel');
    }
    if (typeof worldStateWrapper.getHandle !== 'function') {
      throw new Error('WorldStateWrapper does not have getHandle method');
    }
    // Call getHandle() to get the NAPI External
    return worldStateWrapper.getHandle();
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
          return undefined;
        }

        const contractInstanceForAVM = {
          salt: instance.salt,
          deployer: instance.deployer,
          currentClassId: instance.currentContractClassId,
          originalClassId: instance.originalContractClassId,
          initializationHash: instance.initializationHash,
          publicKeys: instance.publicKeys,
        };

        // TODO(dbanks12): probably need this to be a class with msgpack functions? like hints are....
        return serializeWithMessagePack(contractInstanceForAVM);
      },

      getContractClass: async (classId: string) => {
        this.log.debug(`Contract provider callback: getContractClass(${classId})`);

        // Parse classId string to Fr
        const classIdFr = this.parseFr(classId);

        // Fetch contract class from the contracts DB
        const contractClass = await this.contractsDB.getContractClass(classIdFr);

        if (!contractClass) {
          this.log.debug(`Contract class not found: ${classId}`);
          return undefined;
        }

        const contractClassForAVM = {
          artifactHash: contractClass.artifactHash,
          privateFunctionsRoot: contractClass.privateFunctionsRoot,
          publicBytecodeCommitment: (await this.contractsDB.getBytecodeCommitment(classIdFr)) ?? Fr.ZERO, // TODO(dbanks12): is this zero handling okay?
          packedBytecode: contractClass.packedBytecode,
        };

        // TODO(dbanks12): For now, just manually craft a ContractClassPublic in C++ to match this type.
        // Eventually, this should become a class in TS too, not some 'type' that uses pick and omit.
        return serializeWithMessagePack(contractClassForAVM);
      },
    };
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
