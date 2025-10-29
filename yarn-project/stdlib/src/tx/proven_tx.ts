import { optional } from '@aztec/foundation/schemas';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ChonkProof } from '../proofs/chonk_proof.js';
import type { OffchainEffect } from './offchain_effect.js';
import {
  PrivateExecutionResult,
  collectOffchainEffects,
  collectSortedContractClassLogs,
} from './private_execution_result.js';
import { type ProvingStats, ProvingTimingsSchema } from './profiling.js';
import { Tx } from './tx.js';

export class TxProvingResult {
  constructor(
    public privateExecutionResult: PrivateExecutionResult,
    public publicInputs: PrivateKernelTailCircuitPublicInputs,
    public chonkProof: ChonkProof,
    public stats?: ProvingStats,
  ) {}

  async toTx(): Promise<Tx> {
    const contractClassLogs = collectSortedContractClassLogs(this.privateExecutionResult);

    return await Tx.create({
      data: this.publicInputs,
      chonkProof: this.chonkProof,
      contractClassLogFields: contractClassLogs,
      publicFunctionCalldata: this.privateExecutionResult.publicFunctionCalldata,
    });
  }

  getOffchainEffects(): OffchainEffect[] {
    return collectOffchainEffects(this.privateExecutionResult);
  }

  static get schema() {
    return z
      .object({
        privateExecutionResult: PrivateExecutionResult.schema,
        publicInputs: PrivateKernelTailCircuitPublicInputs.schema,
        chonkProof: ChonkProof.schema,
        timings: optional(ProvingTimingsSchema),
      })
      .transform(TxProvingResult.from);
  }

  static from(fields: FieldsOf<TxProvingResult>) {
    return new TxProvingResult(fields.privateExecutionResult, fields.publicInputs, fields.chonkProof);
  }

  static async random() {
    return new TxProvingResult(
      await PrivateExecutionResult.random(),
      PrivateKernelTailCircuitPublicInputs.empty(),
      ChonkProof.empty(),
    );
  }
}
