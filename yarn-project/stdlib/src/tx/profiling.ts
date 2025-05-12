import { type ZodFor, optional } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type PrivateExecutionStep, PrivateExecutionStepSchema } from '../kernel/private_kernel_prover_output.js';

type FunctionTiming = {
  functionName: string;
  time: number;
};

const FunctionTimingSchema = z.object({ functionName: z.string(), time: z.number() });

export type ProvingTimings = {
  sync?: number;
  proving?: number;
  perFunction: FunctionTiming[];
  unaccounted: number;
  total: number;
};

export const ProvingTimingsSchema = z.object({
  sync: optional(z.number()),
  proving: optional(z.number()),
  perFunction: z.array(FunctionTimingSchema),
  unaccounted: z.number(),
  total: z.number(),
});

export interface SimulationTimings {
  sync: number;
  publicSimulation?: number;
  validation?: number;
  perFunction: FunctionTiming[];
  unaccounted: number;
  total: number;
}

export const SimulationTimingsSchema = z.object({
  sync: z.number(),
  publicSimulation: optional(z.number()),
  validation: optional(z.number()),
  perFunction: z.array(FunctionTimingSchema),
  unaccounted: z.number(),
  total: z.number(),
});

export class TxProfileResult {
  constructor(public executionSteps: PrivateExecutionStep[], public timings: ProvingTimings) {}

  static get schema(): ZodFor<TxProfileResult> {
    return z
      .object({
        executionSteps: z.array(PrivateExecutionStepSchema),
        timings: ProvingTimingsSchema,
      })
      .transform(({ executionSteps, timings }) => new TxProfileResult(executionSteps, timings));
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
      {
        sync: 1,
        proving: 1,
        perFunction: [
          {
            functionName: 'random',
            time: 1,
          },
        ],
        unaccounted: 1,
        total: 4,
      },
    );
  }
}
