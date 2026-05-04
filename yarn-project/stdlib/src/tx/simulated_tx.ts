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
 * Per-address contract DB overrides applied during simulation. For each address, replaces the
 * (instance, optional artifact) pair the simulator uses for that address:
 *
 * - `instance` is always applied. The AVM-side PublicContractsDB uses it for public-call dispatch;
 *   the PXE-side ACIR simulator uses it to resolve address → class id.
 * - `artifact` is optional. When present, the PXE-side simulator uses the override artifact for
 *   ACIR/function lookups during private execution. When absent, PXE falls back to whatever artifact
 *   is registered for the override's `instance.currentContractClassId`.
 *
 * Common use cases: simulating an upgraded class without scheduling a real upgrade; overriding your
 * own account contract so signatures don't need to be valid during simulation.
 */
export type ContractOverrides = Record<
  string /* AztecAddress as string */,
  { instance: ContractInstanceWithAddress; artifact?: ContractArtifact }
>;

export const ContractOverridesSchema = z.record(
  z.string(),
  z.object({ instance: ContractInstanceWithAddressSchema, artifact: ContractArtifactSchema.optional() }),
);

/*
 * Optional values that can be overridden during simulation. In order to simulate a transaction with these
 * set, it *must* be run without the kernel circuits, or validations will fail
 */
export class SimulationOverrides {
  public contracts?: ContractOverrides;

  constructor(contracts: ContractOverrides = {}) {
    this.contracts = Object.keys(contracts).length > 0 ? contracts : undefined;
  }

  static get schema() {
    return z
      .object({
        contracts: optional(
          z.record(
            z.string(),
            z.object({ instance: ContractInstanceWithAddressSchema, artifact: ContractArtifactSchema.optional() }),
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
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
    public publicOutput?: PublicSimulationOutput,
    public stats?: SimulationStats,
  ) {}

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

  toSimulatedTx(): Promise<Tx> {
    return new PrivateSimulationResult(this.privateExecutionResult, this.publicInputs).toSimulatedTx();
  }

  getPublicReturnValues() {
    return this.publicOutput ? this.publicOutput.publicReturnValues : [];
  }
}

/**
 * Recursively accumulate the return values of a call result and its nested executions,
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
