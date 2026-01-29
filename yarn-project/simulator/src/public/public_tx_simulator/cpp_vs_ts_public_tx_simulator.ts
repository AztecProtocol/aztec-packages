import { type Logger, type LoggerBindings, createLogger, logLevel } from '@aztec/foundation/log';
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
 * An implementation of PublicTxSimulator that first simulates in C++, then TS, an compares the results.
 * The C++ simulator accesses the world state directly/natively within C++.
 * For contract DB accesses, it makes callbacks through NAPI back to the TS PublicContractsDB cache.
 */
export class CppVsTsPublicTxSimulator extends PublicTxSimulator implements PublicTxSimulatorInterface {
  protected override log: Logger;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
  ) {
    super(merkleTree, contractsDB, globalVariables, config, undefined, bindings);
    this.log = createLogger(`simulator:cpp_vs_public_tx_simulator`, bindings);
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
    this.log.debug(`Serializing fast simulation inputs to msgpack...`);
    const inputBuffer = fastSimInputs.serializeWithMessagePack();

    let resultBuffer: Buffer;
    try {
      this.log.debug(`Calling C++ simulator for tx ${txHash}`);
      resultBuffer = await avmSimulate(inputBuffer, contractProvider, wsCppHandle, logLevel);
    } catch (error: any) {
      throw new SimulationError(`C++ simulation failed: ${error.message}`, []);
    }

    // If we've reached this point, C++ succeeded during simulation,
    // so we assert that TS also succeeded.
    assert(tsResult !== undefined, 'TS simulation should have succeeded if C++ succeeded');
    assert(tsStateRef !== undefined, 'TS state reference should have been captured if C++ succeeded');

    // Deserialize the msgpack result
    this.log.debug(`Deserializing C++ from buffer (size: ${resultBuffer.length})...`);
    const cppResultJSON: object = deserializeFromMessagePack(resultBuffer);
    this.log.debug(`Deserializing C++ result to PublicTxResult...`);
    const cppResult = PublicTxResult.fromPlainObject(cppResultJSON);
    this.log.debug(`Done.`);
    assert(cppResult.revertCode.equals(tsResult.revertCode));
    assert(cppResult.gasUsed.totalGas.equals(tsResult.gasUsed.totalGas));
    assert(cppResult.gasUsed.publicGas.equals(tsResult.gasUsed.publicGas));
    assert(cppResult.gasUsed.teardownGas.equals(tsResult.gasUsed.teardownGas));
    assert(cppResult.gasUsed.billedGas.equals(tsResult.gasUsed.billedGas));
    assert(cppResult.publicTxEffect.equals(tsResult.publicTxEffect));
    if (cppResult.publicInputs !== undefined) {
      assert(cppResult.publicInputs!.toBuffer().equals(tsResult.publicInputs!.toBuffer()));
    }

    // TODO(fcarreiro): complete this.
    // Check that C++ hints are a strict subset of TS hints.
    // Then enable for misc tests and validate hints.
    //if (this.config?.collectHints) {
    //}

    if (this.config?.collectCallMetadata) {
      assert(cppResult.getAppLogicReturnValues().length === tsResult.getAppLogicReturnValues().length);
      for (let i = 0; i < cppResult.getAppLogicReturnValues().length; i++) {
        assert(cppResult.getAppLogicReturnValues()[i].equals(tsResult.getAppLogicReturnValues()[i]));
      }
    }
    // Messages are still not ok for exceptional halts (they are not plumbed in C++).
    const cppRevertReason = cppResult.findRevertReason() || {};
    const tsRevertReason = tsResult.findRevertReason() || {};
    const cppRevertReasonAsObject = JSON.parse(JSON.stringify(cppRevertReason));
    const tsRevertReasonAsObject = JSON.parse(JSON.stringify(tsRevertReason));
    if (JSON.stringify(cppRevertReasonAsObject) !== JSON.stringify(tsRevertReasonAsObject)) {
      this.log.debug('cppResult.findRevertReason()', cppRevertReasonAsObject);
      this.log.debug('tsResult.findRevertReason()', tsRevertReasonAsObject);
    }
    // TODO: dont compare the strings since this is not deterministic.

    // Sometimes error messages are different between C++ and TS, so we omit in the default comparison
    const cppRevertReasonWithoutMessage = { ...cppRevertReasonAsObject, originalMessage: undefined };
    const tsRevertReasonWithoutMessage = { ...tsRevertReasonAsObject, originalMessage: undefined };
    assert(JSON.stringify(cppRevertReasonWithoutMessage) === JSON.stringify(tsRevertReasonWithoutMessage));

    const cppHasRevertMessage =
      cppRevertReasonAsObject.originalMessage && cppRevertReasonAsObject.originalMessage.length > 0;
    const tsHasRevertMessage =
      tsRevertReasonAsObject.originalMessage && tsRevertReasonAsObject.originalMessage.length > 0;
    // assert that if one of the error messages is non-empty, the other is
    assert(
      cppHasRevertMessage === tsHasRevertMessage,
      'One of the AVM simulators (C++ or TS) produced a revert message, but the other did not',
    );
    // Ideally, we'd love to be able to compare full error messages, but without a lot of work
    // the two simulators will always be able to produce some differing errors.
    // Commenting out the code below will enforce that the error messages are at least
    // similar (one contains the other). Even this is not something we can guarantee.
    //if (cppHasRevertMessage) {
    //  const cppRevertMessageContainsTs = cppRevertReasonAsObject.originalMessage.includes(
    //    tsRevertReasonAsObject.originalMessage,
    //  );
    //  const tsRevertMessageContainsCpp = tsRevertReasonAsObject.originalMessage.includes(
    //    cppRevertReasonAsObject.originalMessage,
    //  );
    //  assert(
    //    cppRevertMessageContainsTs || tsRevertMessageContainsCpp,
    //    'The AVM simulators (C++ and TS) produced different revert messages (neither was a substring of the other)',
    //  );
    //}

    // Confirm that tree roots match
    const cppStateRef = await this.merkleTree.getStateReference();
    assert(
      cppStateRef.equals(tsStateRef),
      `Tree roots mismatch between TS and C++ public simulations for tx ${txHash}`,
    );

    this.log.debug(`C++ simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !cppResult.revertCode.isOK(),
      cppGasUsed: cppResult.gasUsed.totalGas.l2Gas,
    });

    // Return cpp result as it has more detailed metadata / revert reasons
    return cppResult;
  }
}

export class MeasuredCppVsTsPublicTxSimulator
  extends CppVsTsPublicTxSimulator
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
