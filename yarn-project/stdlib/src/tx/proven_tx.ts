import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { PrivateKernelTailCircuitPublicInputs } from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import {
  PrivateExecutionResult,
  collectEnqueuedPublicFunctionCalls,
  collectPublicTeardownFunctionCall,
  collectSortedContractClassLogs,
} from './private_execution_result.js';
import { Tx } from './tx.js';

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
