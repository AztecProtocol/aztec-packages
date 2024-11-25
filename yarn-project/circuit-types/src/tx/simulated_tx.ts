import { ClientIvcProof, Gas, PrivateKernelTailCircuitPublicInputs } from '@aztec/circuits.js';
import { type FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import {
  type PrivateKernelProverProfileResult,
  PrivateKernelProverProfileResultSchema,
} from '../interfaces/private_kernel_prover.js';
import { ContractClassTxL2Logs, UnencryptedTxL2Logs } from '../logs/tx_l2_logs.js';
import {
  PrivateExecutionResult,
  collectEnqueuedPublicFunctionCalls,
  collectPublicTeardownFunctionCall,
  collectSortedContractClassLogs,
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
    const contractClassLogs = new ContractClassTxL2Logs([collectSortedContractClassLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    // NB: no unencrypted logs* come from private, but we keep the property on Tx so enqueued_calls_processor.ts can accumulate public logs
    const tx = new Tx(
      this.publicInputs,
      ClientIvcProof.empty(),
      UnencryptedTxL2Logs.empty(), // *unencrypted logs
      contractClassLogs,
      enqueuedPublicFunctions,
      teardownPublicFunction,
    );
    return tx;
  }

  public toJSON() {
    return {
      privateExecutionResult: this.privateExecutionResult.toJSON(),
      publicInputs: this.publicInputs.toBuffer().toString('hex'),
    };
  }

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

  public override toJSON() {
    return {
      privateExecutionResult: this.privateExecutionResult.toJSON(),
      publicInputs: this.publicInputs.toBuffer().toString('hex'),
      publicOutput: this.publicOutput ? this.publicOutput.toJSON() : undefined,
      profileResult: this.profileResult,
    };
  }

  public static override fromJSON(obj: any) {
    const privateExecutionResult = PrivateExecutionResult.fromJSON(obj.privateExecutionResult);
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(Buffer.from(obj.publicInputs, 'hex'));
    const publicOuput = obj.publicOutput ? PublicSimulationOutput.fromJSON(obj.publicOutput) : undefined;
    const profileResult = obj.profileResult;
    return new TxSimulationResult(privateExecutionResult, publicInputs, publicOuput, profileResult);
  }
}

export class TxProvingResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
    public clientIvcProof: ClientIvcProof,
  ) {}

  toTx(): Tx {
    const contractClassLogs = new ContractClassTxL2Logs([collectSortedContractClassLogs(this.privateExecutionResult)]);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    // NB: no unencrypted logs* come from private, but we keep the property on Tx so enqueued_calls_processor.ts can accumulate public logs
    const tx = new Tx(
      this.publicInputs,
      this.clientIvcProof,
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

  public toJSON() {
    return {
      privateExecutionResult: this.privateExecutionResult,
      publicInputs: this.publicInputs,
      clientIvcProof: this.clientIvcProof,
    };
  }

  public static fromJSON(obj: any) {
    const privateExecutionResult = PrivateExecutionResult.fromJSON(obj.privateExecutionResult);
    const publicInputs = PrivateKernelTailCircuitPublicInputs.fromBuffer(Buffer.from(obj.publicInputs, 'hex'));
    const clientIvcProof = ClientIvcProof.fromBuffer(Buffer.from(obj.clientIvcProof, 'hex'));
    return new TxProvingResult(privateExecutionResult, publicInputs, clientIvcProof);
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
