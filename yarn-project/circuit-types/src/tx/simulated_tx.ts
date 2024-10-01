import { ClientIvcProof, PrivateKernelTailCircuitPublicInputs } from '@aztec/circuits.js';

import {
  PrivateExecutionResult,
  collectEnqueuedPublicFunctionCalls,
  collectPublicTeardownFunctionCall,
  collectSortedEncryptedLogs,
  collectSortedNoteEncryptedLogs,
  collectSortedUnencryptedLogs,
} from '../execution_result.js';
import { EncryptedNoteTxL2Logs, EncryptedTxL2Logs, UnencryptedTxL2Logs } from '../index.js';
import { PublicExecutionResult } from '../public_execution_result.js';
import { NestedProcessReturnValues, PublicSimulationOutput } from './public_simulation_output.js';
import { Tx } from './tx.js';

export class PrivateSimulationResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public clientIvcProof: ClientIvcProof,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
  ) {}

  getReturnValues() {
    return accumulateReturnValues(this.privateExecutionResult);
  }

  toTx(): Tx {
    const noteEncryptedLogs = new EncryptedNoteTxL2Logs([collectSortedNoteEncryptedLogs(this.privateExecutionResult)]);
    const unencryptedLogs = new UnencryptedTxL2Logs([collectSortedUnencryptedLogs(this.privateExecutionResult)]);
    const encryptedLogs = new EncryptedTxL2Logs([collectSortedEncryptedLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    const tx = new Tx(
      this.publicInputs,
      this.clientIvcProof!,
      noteEncryptedLogs,
      encryptedLogs,
      unencryptedLogs,
      enqueuedPublicFunctions,
      teardownPublicFunction,
    );
    return tx;
  }

  /**
   * Convert a SimulatedTx class object to a plain JSON object.
   * @returns A plain object with SimulatedTx properties.
   */
  public toJSON() {
    return {
      privateExecutionResult: this.privateExecutionResult.toJSON(),
      clientIvcProof: this.clientIvcProof.toBuffer().toString('hex'),
      publicInputs: this.publicInputs.toBuffer().toString('hex'),
    };
  }

  /**
   * Convert a plain JSON object to a Tx class object.
   * @param obj - A plain Tx JSON object.
   * @returns A Tx class object.
   */
  public static fromJSON(obj: any) {
    const privateExecutionResult = PrivateExecutionResult.fromJSON(obj.privateExecutionResult);
    const clientIvcProof = ClientIvcProof.fromBuffer(Buffer.from(obj.clientIvcProof, 'hex'));
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(Buffer.from(obj.publicInputs, 'hex'));
    return new PrivateSimulationResult(privateExecutionResult, clientIvcProof, publicInputs);
  }
}

export class TxSimulationResult {
  constructor(
    public tx: Tx,
    public privateReturValues: NestedProcessReturnValues,
    public publicOutput?: PublicSimulationOutput,
  ) {}
}

/**
 * Recursively accummulate the return values of a call result and its nested executions,
 * so they can be retrieved in order.
 * @param executionResult
 * @returns
 */
export function accumulateReturnValues(
  executionResult: PublicExecutionResult | PrivateExecutionResult,
): NestedProcessReturnValues {
  const acc = new NestedProcessReturnValues(executionResult.returnValues);
  acc.nested = executionResult.nestedExecutions.map(nestedExecution => accumulateReturnValues(nestedExecution));
  return acc;
}
