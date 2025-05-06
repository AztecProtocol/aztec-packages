import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type PrivateExecutionStep, PrivateExecutionStepSchema } from '../kernel/private_kernel_prover_output.js';

export class TxProfileResult {
  constructor(public executionSteps: PrivateExecutionStep[], public syncTime: number, public provingTime?: number) {}

  static get schema(): ZodFor<TxProfileResult> {
    return z
      .object({
        executionSteps: z.array(PrivateExecutionStepSchema),
        provingTime: z.number().optional(),
        syncTime: z.number(),
      })
      .transform(
        ({ executionSteps, syncTime, provingTime }) => new TxProfileResult(executionSteps, syncTime, provingTime),
      );
  }

  static random(): TxProfileResult {
    return new TxProfileResult(
      [
        {
          functionName: 'random',
          bytecode: Buffer.from('random'),
          witness: new Map([[1, 'random']]),
          vk: Buffer.from('random'),
          timings: {
            witgen: 1,
            gateCount: 1,
          },
        },
      ],
      1,
      1,
    );
  }
}
