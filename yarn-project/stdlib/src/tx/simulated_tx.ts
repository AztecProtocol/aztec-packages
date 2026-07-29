import { type ZodFor, optional } from '@aztec/foundation/schemas';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import {
  type ContractInstanceWithAddress,
  ContractInstanceWithAddressSchema,
} from '../contract/interfaces/contract_instance.js';
import { Gas } from '../gas/gas.js';
import type { GasUsed } from '../gas/gas_used.js';
import { MAX_RPC_CONTRACT_OVERRIDES_LEN, MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN } from '../interfaces/api_limit.js';
import { type PublicStorageOverride, PublicStorageOverrideSchema } from '../interfaces/public_storage_override.js';
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
 * If passed during the execution of a user circuit, the contract function simulator will replace
 * the contract instance at that address with the one provided. An example use case would be
 * overriding your own account contract so that valid signatures don't have to be provided while
 * simulating. The override's `currentContractClassId` resolves through PXE's locally registered
 * classes, so pre-register the target artifact via `pxe.registerContractClass(...)`.
 */
export type ContractOverrides = Record<string /* AztecAddress as string */, { instance: ContractInstanceWithAddress }>;

/*
 * Optional values that can be overridden during simulation. `publicStorage` writes to the public-data
 * tree fork. `contracts` overrides contract instances in the contract DB.
 * In order to simulate a transaction with these set, it *must* be run without the kernel circuits,
 * or validations will fail.
 */
export class SimulationOverrides {
  public publicStorage?: PublicStorageOverride[];
  public contracts?: ContractOverrides;

  constructor(args: { publicStorage?: PublicStorageOverride[]; contracts?: ContractOverrides } = {}) {
    this.publicStorage = args.publicStorage?.length ? args.publicStorage : undefined;
    this.contracts = args.contracts && Object.keys(args.contracts).length > 0 ? args.contracts : undefined;
  }

  static get schema() {
    return z
      .object({
        publicStorage: optional(
          z.array(PublicStorageOverrideSchema).max(MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN, {
            message: `publicStorage must have at most ${MAX_RPC_PUBLIC_STORAGE_OVERRIDES_LEN} entries`,
          }),
        ),
        contracts: optional(
          z
            .record(z.string(), z.object({ instance: ContractInstanceWithAddressSchema }))
            .refine(contracts => Object.keys(contracts).length <= MAX_RPC_CONTRACT_OVERRIDES_LEN, {
              message: `contracts must have at most ${MAX_RPC_CONTRACT_OVERRIDES_LEN} entries`,
            }),
        ),
      })
      .transform(args => new SimulationOverrides(args));
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
