import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { type PublicSimulatorConfig, PublicTxResult } from '@aztec/stdlib/avm';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/trees';
import type { GlobalVariables, StateReference, Tx } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

import type { AvmIpcBackend } from '../avm_simulator_pool.js';
import type { ExecutorMetricsInterface } from '../executor_metrics_interface.js';
import type { PublicContractsDB } from '../public_db_sources.js';
import { CppPublicTxSimulator } from './cpp_public_tx_simulator.js';
import { PublicTxSimulator } from './public_tx_simulator.js';
import type {
  MeasuredPublicTxSimulatorInterface,
  PublicTxSimulatorInterface,
  SimulationHandle,
} from './public_tx_simulator_interface.js';

/**
 * An implementation of PublicTxSimulator that first simulates in C++ (via IPC), then TS, and compares the results.
 * The C++ simulator runs in an external aztec-avm process and accesses world state via WSDB IPC.
 * The TS simulator runs in-process and accesses world state directly.
 *
 * This is the IPC replacement for the old NAPI-based CppVsTsPublicTxSimulator.
 * Instead of calling avmSimulate() via NAPI, it delegates to CppPublicTxSimulator which
 * communicates with the aztec-avm binary over UDS.
 */
export class IpcVsTsPublicTxSimulator extends PublicTxSimulator implements PublicTxSimulatorInterface {
  protected override log: Logger;
  private cppSimulator: CppPublicTxSimulator;

  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    avmBackend: AvmIpcBackend,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(merkleTree, contractsDB, globalVariables, config, undefined, bindings);
    this.log = createLogger('simulator:ipc_vs_ts_public_tx_simulator', bindings);
    this.cppSimulator = new CppPublicTxSimulator(avmBackend, globalVariables, config, bindings, wsdbForkId);
  }

  /**
   * Simulate a transaction's public portion using both C++ (IPC) and TS simulators, then compare results.
   *
   * @param tx - The transaction to simulate.
   * @returns A SimulationHandle with the result of the C++ simulation (after verifying parity with TS).
   */
  public override simulate(tx: Tx): SimulationHandle {
    const result = this.doCompare(tx);
    return { result, cancel: async () => {} };
  }

  private async doCompare(tx: Tx): Promise<PublicTxResult> {
    const txHash = this.computeTxHash(tx);
    this.log.debug(`IPC vs TS simulation of ${tx.publicFunctionCalldata.length} public calls for tx ${txHash}`, {
      txHash,
    });

    // Run TS simulation first (with checkpoint so we can revert)
    this.log.debug(`Running TS simulation for tx ${txHash}`);
    let tsResult: PublicTxResult | undefined;
    let tsStateRef: StateReference | undefined;
    await this.merkleTree.createCheckpoint();
    this.contractsDB.createCheckpoint();
    try {
      tsResult = await super.simulate(tx).result;
      this.log.debug(`TS simulation completed for tx ${txHash}`);
      tsStateRef = await this.merkleTree.getStateReference();
    } catch (error: any) {
      this.log.warn(`TS simulation failed, but still continuing with C++ simulation: ${error.message} ${error.stack}`);
    } finally {
      // Revert checkpoint so C++ can reapply exactly the same changes
      await this.merkleTree.revertCheckpoint();
      this.contractsDB.revertCheckpoint();
    }

    // Run C++ simulation via IPC
    this.log.debug(`Running C++ (IPC) simulation for tx ${txHash}`);
    const cppResult = await this.cppSimulator.simulate(tx).result;

    // If C++ succeeded, TS should have too
    assert(tsResult !== undefined, 'TS simulation should have succeeded if C++ succeeded');
    assert(tsStateRef !== undefined, 'TS state reference should have been captured if C++ succeeded');

    // Compare results
    assert(cppResult.revertCode.equals(tsResult.revertCode));
    assert(cppResult.gasUsed.totalGas.equals(tsResult.gasUsed.totalGas));
    assert(cppResult.gasUsed.publicGas.equals(tsResult.gasUsed.publicGas));
    assert(cppResult.gasUsed.teardownGas.equals(tsResult.gasUsed.teardownGas));
    assert(cppResult.gasUsed.billedGas.equals(tsResult.gasUsed.billedGas));
    assert(cppResult.publicTxEffect.equals(tsResult.publicTxEffect));
    if (cppResult.publicInputs !== undefined) {
      assert(cppResult.publicInputs!.toBuffer().equals(tsResult.publicInputs!.toBuffer()));
    }

    // Compare call metadata (return values)
    if (this.config?.collectCallMetadata) {
      assert(cppResult.getAppLogicReturnValues().length === tsResult.getAppLogicReturnValues().length);
      for (let i = 0; i < cppResult.getAppLogicReturnValues().length; i++) {
        assert(cppResult.getAppLogicReturnValues()[i].equals(tsResult.getAppLogicReturnValues()[i]));
      }
    }

    // Compare revert reasons (messages may differ between C++ and TS, so compare without message)
    const cppRevertReason = cppResult.findRevertReason() || {};
    const tsRevertReason = tsResult.findRevertReason() || {};
    const cppRevertReasonAsObject = JSON.parse(JSON.stringify(cppRevertReason));
    const tsRevertReasonAsObject = JSON.parse(JSON.stringify(tsRevertReason));
    if (JSON.stringify(cppRevertReasonAsObject) !== JSON.stringify(tsRevertReasonAsObject)) {
      this.log.debug('cppResult.findRevertReason()', cppRevertReasonAsObject);
      this.log.debug('tsResult.findRevertReason()', tsRevertReasonAsObject);
    }

    const cppRevertReasonWithoutMessage = { ...cppRevertReasonAsObject, originalMessage: undefined };
    const tsRevertReasonWithoutMessage = { ...tsRevertReasonAsObject, originalMessage: undefined };
    assert(JSON.stringify(cppRevertReasonWithoutMessage) === JSON.stringify(tsRevertReasonWithoutMessage));

    const cppHasRevertMessage =
      cppRevertReasonAsObject.originalMessage && cppRevertReasonAsObject.originalMessage.length > 0;
    const tsHasRevertMessage =
      tsRevertReasonAsObject.originalMessage && tsRevertReasonAsObject.originalMessage.length > 0;
    assert(
      cppHasRevertMessage === tsHasRevertMessage,
      'One of the AVM simulators (C++ or TS) produced a revert message, but the other did not',
    );

    // Confirm that tree roots match
    const cppStateRef = await this.merkleTree.getStateReference();
    assert(
      cppStateRef.equals(tsStateRef),
      `Tree roots mismatch between TS and C++ public simulations for tx ${txHash}`,
    );

    this.log.debug(`IPC vs TS simulation completed for tx ${txHash}`, {
      txHash,
      reverted: !cppResult.revertCode.isOK(),
      cppGasUsed: cppResult.gasUsed.totalGas.l2Gas,
    });

    // Return cpp result as it has more detailed metadata / revert reasons
    return cppResult;
  }
}

/** Measured wrapper that records simulation timing metrics. */
export class MeasuredIpcVsTsPublicTxSimulator
  extends IpcVsTsPublicTxSimulator
  implements MeasuredPublicTxSimulatorInterface
{
  constructor(
    merkleTree: MerkleTreeWriteOperations,
    contractsDB: PublicContractsDB,
    globalVariables: GlobalVariables,
    avmBackend: AvmIpcBackend,
    protected readonly metrics: ExecutorMetricsInterface,
    config?: Partial<PublicSimulatorConfig>,
    bindings?: LoggerBindings,
    wsdbForkId?: number,
  ) {
    super(merkleTree, contractsDB, globalVariables, avmBackend, config, bindings, wsdbForkId);
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
