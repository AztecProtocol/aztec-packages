import type { ZodFor } from '@aztec/foundation/schemas';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import {
  type PrivateKernelProverProfileResult,
  PrivateKernelProverProfileResultSchema,
} from '../kernel/private_kernel_prover_profile_result.js';
import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import {
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  collectEnqueuedPublicFunctionCalls,
  collectPublicTeardownFunctionCall,
  collectSortedContractClassLogs,
} from './private_execution_result.js';
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
    const contractClassLogs = collectSortedContractClassLogs(this.privateExecutionResult);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    const tx = new Tx(
      this.publicInputs,
      ClientIvcProof.empty(),
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
        billedGas: this.publicInputs.gasUsed,
        teardownGas: Gas.empty(),
        publicGas: Gas.empty(),
      }
    );
  }

  static get schema(): ZodFor<TxSimulationResult> {
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

  static async random() {
    return new TxSimulationResult(
      await PrivateExecutionResult.random(),
      PrivateKernelTailCircuitPublicInputs.empty(),
      await PublicSimulationOutput.random(),
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
    const contractClassLogs = collectSortedContractClassLogs(this.privateExecutionResult);
    const enqueuedPublicFunctions = collectEnqueuedPublicFunctionCalls(this.privateExecutionResult);
    const teardownPublicFunction = collectPublicTeardownFunctionCall(this.privateExecutionResult);

    const tx = new Tx(
      this.publicInputs,
      this.clientIvcProof,
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

  static async random() {
    return new TxProvingResult(
      await PrivateExecutionResult.random(),
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
  const collectPrivateReturnValuesRecursive = (
    executionResult: PrivateCallExecutionResult,
  ): NestedProcessReturnValues => {
    const acc = new NestedProcessReturnValues(executionResult.returnValues);
    acc.nested = executionResult.nestedExecutions.map(nestedExecution =>
      collectPrivateReturnValuesRecursive(nestedExecution),
    );
    return acc;
  };
  return collectPrivateReturnValuesRecursive(executionResult.entrypoint);
}
