import { ClientIvcProof, PrivateKernelTailCircuitPublicInputs } from '@aztec/circuits.js';

import { EncryptedNoteTxL2Logs, EncryptedTxL2Logs, UnencryptedTxL2Logs } from '../index.js';
import {
  PrivateExecutionResult,
  collectEnqueuedPublicFunctionCalls,
  collectPublicTeardownFunctionCall,
  collectSortedEncryptedLogs,
  collectSortedNoteEncryptedLogs,
  collectSortedUnencryptedLogs,
} from '../private_execution_result.js';
import { type PublicExecutionResult } from '../public_execution_result.js';
import { NestedProcessReturnValues, PublicSimulationOutput } from './public_simulation_output.js';
import { Tx } from './tx.js';

export class PrivateSimulationResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
  ) {}

  getPrivateReturnValues() {
    return accumulateReturnValues(this.privateExecutionResult);
  }

  toSimulatedTx(): Tx {
    const noteEncryptedLogs = new EncryptedNoteTxL2Logs([collectSortedNoteEncryptedLogs(this.privateExecutionResult)]);
    const unencryptedLogs = new UnencryptedTxL2Logs([collectSortedUnencryptedLogs(this.privateExecutionResult)]);
    const encryptedLogs = new EncryptedTxL2Logs([collectSortedEncryptedLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    const tx = new Tx(
      this.publicInputs,
      ClientIvcProof.empty(),
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
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(Buffer.from(obj.publicInputs, 'hex'));
    return new PrivateSimulationResult(privateExecutionResult, publicInputs);
  }
}

export class TxSimulationResult extends PrivateSimulationResult {
  constructor(
    privateExecutionResult: PrivateExecutionResult,
    publicInputs: PrivateKernelTailCircuitPublicInputs,
    public publicOutput?: PublicSimulationOutput,
  ) {
    super(privateExecutionResult, publicInputs);
  }

  getPublicReturnValues() {
    return this.publicOutput ? this.publicOutput.publicReturnValues : [];
  }

  static fromPrivateSimulationResultAndPublicOutput(
    privateSimulationResult: PrivateSimulationResult,
    publicOutput?: PublicSimulationOutput,
  ) {
    return new TxSimulationResult(
      privateSimulationResult.privateExecutionResult,
      privateSimulationResult.publicInputs,
      publicOutput,
    );
  }

  /**
   * Convert a SimulatedTx class object to a plain JSON object.
   * @returns A plain object with SimulatedTx properties.
   */
  public override toJSON() {
    return {
      privateExecutionResult: this.privateExecutionResult.toJSON(),
      publicInputs: this.publicInputs.toBuffer().toString('hex'),
      publicOutput: this.publicOutput ? this.publicOutput.toJSON() : undefined,
    };
  }

  /**
   * Convert a plain JSON object to a Tx class object.
   * @param obj - A plain Tx JSON object.
   * @returns A Tx class object.
   */
  public static override fromJSON(obj: any) {
    const privateExecutionResult = PrivateExecutionResult.fromJSON(obj.privateExecutionResult);
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(Buffer.from(obj.publicInputs, 'hex'));
    const publicOuput = obj.publicOutput ? PublicSimulationOutput.fromJSON(obj.publicOutput) : undefined;
    return new TxSimulationResult(privateExecutionResult, publicInputs, publicOuput);
  }
}

export class TxProvingResult extends TxSimulationResult {
  constructor(
    privateExecutionResult: PrivateExecutionResult,
    publicInputs: PrivateKernelTailCircuitPublicInputs,
    public clientIvcProof: ClientIvcProof,
    publicOutput?: PublicSimulationOutput,
  ) {
    super(privateExecutionResult, publicInputs, publicOutput);
  }

  toTx(): Tx {
    const noteEncryptedLogs = new EncryptedNoteTxL2Logs([collectSortedNoteEncryptedLogs(this.privateExecutionResult)]);
    const unencryptedLogs = new UnencryptedTxL2Logs([collectSortedUnencryptedLogs(this.privateExecutionResult)]);
    const encryptedLogs = new EncryptedTxL2Logs([collectSortedEncryptedLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    const tx = new Tx(
      this.publicInputs,
      this.clientIvcProof,
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
  public override toJSON() {
    return {
      privateExecutionResult: this.privateExecutionResult.toJSON(),
      publicInputs: this.publicInputs.toBuffer().toString('hex'),
      publicOutput: this.publicOutput ? this.publicOutput.toJSON() : undefined,
      clientIvcProof: this.clientIvcProof.toBuffer().toString('hex'),
    };
  }

  /**
   * Convert a plain JSON object to a Tx class object.
   * @param obj - A plain Tx JSON object.
   * @returns A Tx class object.
   */
  public static override fromJSON(obj: any) {
    const privateExecutionResult = PrivateExecutionResult.fromJSON(obj.privateExecutionResult);
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(Buffer.from(obj.publicInputs, 'hex'));
    const publicOuput = obj.publicOutput ? PublicSimulationOutput.fromJSON(obj.publicOutput) : undefined;
    const clientIvcProof = ClientIvcProof.fromBuffer(Buffer.from(obj.clientIvcProof, 'hex'));
    return new TxProvingResult(privateExecutionResult, publicInputs, clientIvcProof, publicOuput);
  }
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
