import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type PrivateExecutionStep, PrivateExecutionStepSchema } from '../kernel/private_kernel_prover_output.js';

export class TxProfileResult {
  constructor(public executionSteps: PrivateExecutionStep[]) {}

  static get schema(): ZodFor<TxProfileResult> {
    return z
      .object({
        executionSteps: z.array(PrivateExecutionStepSchema),
      })
      .transform(({ executionSteps }) => new TxProfileResult(executionSteps));
  }

  static random(): TxProfileResult {
    return new TxProfileResult([
      {
        functionName: 'random',
        bytecode: Buffer.from('random'),
        witness: new Map([[1, 'random']]),
        vk: Buffer.from('random'),
      },
    ]);
  }
}
