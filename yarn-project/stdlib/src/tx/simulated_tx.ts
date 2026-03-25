import { type ZodFor, optional } from '@aztec/foundation/schemas';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { type ContractArtifact, ContractArtifactSchema } from '../abi/abi.js';
import {
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
} from '../contract/interfaces/contract_instance.js';
import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ChonkProof } from '../proofs/chonk_proof.js';
import type { OffchainEffect } from './offchain_effect.js';
import {
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  collectOffchainEffects,
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
      chonkProof: ChonkProof.empty(),
      contractClassLogFields: contractClassLogs,
      publicFunctionCalldata: this.privateExecutionResult.publicFunctionCalldata,
    });
  }
}

export class TxSimulationResult {
  /**
   * Index of the app's first call in a flattened array of calls. The wallet wraps the app payload in an entrypoint and
   * may prepend fee payment calls, producing a flattened ordering of:
   *   0 = entrypoint, 1..N = fee calls, N+1 = first app call.
   * When undefined or 0, the app call is the root execution itself (DefaultEntrypoint / NO_FROM).
   */
  public appCallOffset?: number;

  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
    public publicOutput?: PublicSimulationOutput,
    public stats?: SimulationStats,
  ) {}

  setAppCallOffset(offset: number): void {
    this.appCallOffset = offset;
  }

  /** Returns offchain effects collected from private execution. */
  get offchainEffects(): OffchainEffect[] {
    return collectOffchainEffects(this.privateExecutionResult);
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
        stats: optional(SimulationStatsSchema),
      })
      .transform(TxSimulationResult.from);
  }

  static from(fields: Omit<FieldsOf<TxSimulationResult>, 'gasUsed' | 'offchainEffects'>) {
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

  /**
   * Returns the private return values that correspond to the first app call.
   */
  getAppPrivateReturnValues(callIndex: number = 0): NestedProcessReturnValues | undefined {
    const all = this.getPrivateReturnValues();
    if (!this.appCallOffset) {
      // appCallOffset is 0 or undefined implies that the app call is the root execution
      return all;
    }
    // The app call offset is defined on the flattened array of calls where entrypoint occupies index 0. Here we are
    // indexing into nested calls array and for this reason we need to subtract 1.
    return all?.nested?.[callIndex + this.appCallOffset - 1];
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
