import { type ZodFor, optional } from '@aztec/foundation/schemas';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { type ContractArtifact, ContractArtifactSchema } from '../abi/abi.js';
import { AztecAddress } from '../aztec-address/index.js';
import {
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
} from '../contract/interfaces/contract_instance.js';
import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import {
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  collectSortedContractClassLogs,
} from './private_execution_result.js';
import { type SimulationStats, SimulationStatsSchema } from './profiling.js';
import { NestedProcessReturnValues, PublicSimulationOutput } from './public_simulation_output.js';
import { Tx } from './tx.js';

/*
 * If passed during the execution of a user circuit, the contract function simulator will replace the instance and class
 * of the contract with the one provided in the overrides for that address. An example use case
 * would be overriding your own account contract so that valid signatures don't have to be provided while simulating.
 */
export type ContractOverrides = Record<
  string /* AztecAddress as string */,
  { instance: ContractInstanceWithAddress; artifact: ContractArtifact }
>;

/*
 * Optional values that can be overridden during simulation. In order to simulate a transaction with these
 * set, it *must* be run without the kernel circuits, or validations will fail
 */
export class SimulationOverrides {
  constructor(public contracts?: ContractOverrides) {}

  static get schema() {
    return z
      .object({
        contracts: optional(
          z.record(
            z.string(),
            z.object({ instance: ContractInstanceWithAddressSchema, artifact: ContractArtifactSchema }),
          ),
        ),
      })
      .transform(({ contracts }) => {
        return new SimulationOverrides(contracts);
      });
  }
}

export class PrivateSimulationResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
  ) {}

  getPrivateReturnValues() {
    return accumulatePrivateReturnValues(this.privateExecutionResult);
  }

  async toSimulatedTx(): Promise<Tx> {
    const contractClassLogs = collectSortedContractClassLogs(this.privateExecutionResult);

    return await Tx.create({
      data: this.publicInputs,
      clientIvcProof: ClientIvcProof.empty(),
      contractClassLogFields: contractClassLogs,
      publicFunctionCalldata: this.privateExecutionResult.publicFunctionCalldata,
    });
  }
}

export class TxSimulationResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
    public publicOutput?: PublicSimulationOutput,
    public stats?: SimulationStats,
  ) {}

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
        stats: optional(SimulationStatsSchema),
      })
      .transform(TxSimulationResult.from);
  }

  static from(fields: Omit<FieldsOf<TxSimulationResult>, 'gasUsed'>) {
    return new TxSimulationResult(
      fields.privateExecutionResult,
      fields.publicInputs,
      fields.publicOutput,
      fields.stats,
    );
  }

  static fromPrivateSimulationResultAndPublicOutput(
    privateSimulationResult: PrivateSimulationResult,
    publicOutput?: PublicSimulationOutput,
    stats?: SimulationStats,
  ) {
    return new TxSimulationResult(
      privateSimulationResult.privateExecutionResult,
      privateSimulationResult.publicInputs,
      publicOutput,
      stats,
    );
  }

  static async random() {
    return new TxSimulationResult(
      await PrivateExecutionResult.random(),
      PrivateKernelTailCircuitPublicInputs.empty(),
      await PublicSimulationOutput.random(),
    );
  }

  getPrivateReturnValues() {
    return new PrivateSimulationResult(this.privateExecutionResult, this.publicInputs).getPrivateReturnValues();
  }

  toSimulatedTx(): Promise<Tx> {
    return new PrivateSimulationResult(this.privateExecutionResult, this.publicInputs).toSimulatedTx();
  }

  getPublicReturnValues() {
    return this.publicOutput ? this.publicOutput.publicReturnValues : [];
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
    acc.nested = executionResult.nestedExecutionResults.map(nestedExecutionResult =>
      collectPrivateReturnValuesRecursive(nestedExecutionResult),
    );
    return acc;
  };
  return collectPrivateReturnValuesRecursive(executionResult.entrypoint);
}
