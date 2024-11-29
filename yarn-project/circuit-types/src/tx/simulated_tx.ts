import { ClientIvcProof, Gas, PrivateKernelTailCircuitPublicInputs } from '@aztec/circuits.js';
import { type FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import {
  type PrivateKernelProverProfileResult,
  PrivateKernelProverProfileResultSchema,
} from '../interfaces/private_kernel_prover.js';
import {
  ContractClassTxL2Logs,
  EncryptedNoteTxL2Logs,
  EncryptedTxL2Logs,
  UnencryptedTxL2Logs,
} from '../logs/tx_l2_logs.js';
import {
  PrivateExecutionResult,
  collectEnqueuedPublicFunctionCalls,
  collectPublicTeardownFunctionCall,
  collectSortedContractClassLogs,
  collectSortedEncryptedLogs,
  collectSortedNoteEncryptedLogs,
} from '../private_execution_result.js';
import { type GasUsed } from './gas_used.js';
import { NestedProcessReturnValues, PublicSimulationOutput } from './public_simulation_output.js';
import { Tx } from './tx.js';

export class PrivateSimulationResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
  ) {}

  getPrivateReturnValues() {
    return accumulatePrivateReturnValues(this.privateExecutionResult);
  }

  toSimulatedTx(): Tx {
    const noteEncryptedLogs = new EncryptedNoteTxL2Logs([collectSortedNoteEncryptedLogs(this.privateExecutionResult)]);
    const contractClassLogs = new ContractClassTxL2Logs([collectSortedContractClassLogs(this.privateExecutionResult)]);
    const encryptedLogs = new EncryptedTxL2Logs([collectSortedEncryptedLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    // NB: no unencrypted logs* come from private, but we keep the property on Tx so enqueued_calls_processor.ts can accumulate public logs
    const tx = new Tx(
      this.publicInputs,
      ClientIvcProof.empty(),
      noteEncryptedLogs,
      encryptedLogs,
      UnencryptedTxL2Logs.empty(), // *unencrypted logs
      contractClassLogs,
      enqueuedPublicFunctions,
      teardownPublicFunction,
    );
    return tx;
  }
}

export class TxSimulationResult extends PrivateSimulationResult {
  constructor(
    privateExecutionResult: PrivateExecutionResult,
    publicInputs: PrivateKernelTailCircuitPublicInputs,
    public publicOutput?: PublicSimulationOutput,
    public profileResult?: PrivateKernelProverProfileResult,
  ) {
    super(privateExecutionResult, publicInputs);
  }

  get gasUsed(): GasUsed {
    return (
      this.publicOutput?.gasUsed ?? {
        totalGas: this.publicInputs.gasUsed,
        teardownGas: Gas.empty(),
      }
    );
  }

  static get schema() {
    return z
      .object({
        privateExecutionResult: PrivateExecutionResult.schema,
        publicInputs: PrivateKernelTailCircuitPublicInputs.schema,
        publicOutput: PublicSimulationOutput.schema.optional(),
        profileResult: PrivateKernelProverProfileResultSchema.optional(),
      })
      .transform(TxSimulationResult.from);
  }

  static from(fields: Omit<FieldsOf<TxSimulationResult>, 'gasUsed'>) {
    return new TxSimulationResult(
      fields.privateExecutionResult,
      fields.publicInputs,
      fields.publicOutput,
      fields.profileResult,
    );
  }

  getPublicReturnValues() {
    return this.publicOutput ? this.publicOutput.publicReturnValues : [];
  }

  static fromPrivateSimulationResultAndPublicOutput(
    privateSimulationResult: PrivateSimulationResult,
    publicOutput?: PublicSimulationOutput,
    profileResult?: PrivateKernelProverProfileResult,
  ) {
    return new TxSimulationResult(
      privateSimulationResult.privateExecutionResult,
      privateSimulationResult.publicInputs,
      publicOutput,
      profileResult,
    );
  }

  static random() {
    return new TxSimulationResult(
      PrivateExecutionResult.random(),
      PrivateKernelTailCircuitPublicInputs.empty(),
      PublicSimulationOutput.random(),
    );
  }
}

export class TxProvingResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
    public clientIvcProof: ClientIvcProof,
  ) {}

  toTx(): Tx {
    const noteEncryptedLogs = new EncryptedNoteTxL2Logs([collectSortedNoteEncryptedLogs(this.privateExecutionResult)]);
    const contractClassLogs = new ContractClassTxL2Logs([collectSortedContractClassLogs(this.privateExecutionResult)]);
    const encryptedLogs = new EncryptedTxL2Logs([collectSortedEncryptedLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    // NB: no unencrypted logs* come from private, but we keep the property on Tx so enqueued_calls_processor.ts can accumulate public logs
    const tx = new Tx(
      this.publicInputs,
      this.clientIvcProof,
      noteEncryptedLogs,
      encryptedLogs,
      UnencryptedTxL2Logs.empty(), // *unencrypted logs
      contractClassLogs,
      enqueuedPublicFunctions,
      teardownPublicFunction,
    );
    return tx;
  }

  static get schema() {
    return z
      .object({
        privateExecutionResult: PrivateExecutionResult.schema,
        publicInputs: PrivateKernelTailCircuitPublicInputs.schema,
        clientIvcProof: ClientIvcProof.schema,
      })
      .transform(TxProvingResult.from);
  }

  static from(fields: FieldsOf<TxProvingResult>) {
    return new TxProvingResult(fields.privateExecutionResult, fields.publicInputs, fields.clientIvcProof);
  }

  static random() {
    return new TxProvingResult(
      PrivateExecutionResult.random(),
      PrivateKernelTailCircuitPublicInputs.empty(),
      ClientIvcProof.empty(),
    );
  }
}

/**
 * Recursively accummulate the return values of a call result and its nested executions,
 * so they can be retrieved in order.
 * @param executionResult
 * @returns
 */
export function accumulatePrivateReturnValues(executionResult: PrivateExecutionResult): NestedProcessReturnValues {
  const acc = new NestedProcessReturnValues(executionResult.returnValues);
  acc.nested = executionResult.nestedExecutions.map(nestedExecution => accumulatePrivateReturnValues(nestedExecution));
  return acc;
}
