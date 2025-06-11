import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, optional } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AbiDecoded } from '../abi/decoder.js';
import type { AztecNode } from '../interfaces/aztec-node.js';
import { type PrivateExecutionStep, PrivateExecutionStepSchema } from '../kernel/private_kernel_prover_output.js';
import { AbiDecodedSchema } from '../schemas/schemas.js';

export type NodeStats = Partial<Record<keyof AztecNode, { times: number[] }>>;

const NodeStatsSchema = z.record(z.string(), z.object({ times: z.array(z.number()) }));

type FunctionTiming = {
  functionName: string;
  time: number;
  oracles?: Record<string, { times: number[] }>;
};

const FunctionTimingSchema = z.object({
  functionName: z.string(),
  time: z.number(),
  oracles: optional(z.record(z.string(), z.object({ times: z.array(z.number()) }))),
});

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

export interface ProvingStats {
  timings: ProvingTimings;
  nodeRPCCalls?: NodeStats;
}

export const ProvingStatsSchema = z.object({
  timings: ProvingTimingsSchema,
  nodeRPCCalls: optional(NodeStatsSchema),
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

export interface SimulationStats {
  timings: SimulationTimings;
  nodeRPCCalls: NodeStats;
}

export const SimulationStatsSchema = z.object({
  timings: SimulationTimingsSchema,
  nodeRPCCalls: NodeStatsSchema,
});

export class TxProfileResult {
  constructor(
    public executionSteps: PrivateExecutionStep[],
    public stats: ProvingStats,
  ) {}

  static get schema(): ZodFor<TxProfileResult> {
    return z
      .object({
        executionSteps: z.array(PrivateExecutionStepSchema),
        stats: ProvingStatsSchema,
      })
      .transform(({ executionSteps, stats }) => new TxProfileResult(executionSteps, stats));
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
        nodeRPCCalls: { getBlockHeader: { times: [1] } },
        timings: {
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
      },
    );
  }
}

export class UtilitySimulationResult {
  constructor(
    public result: AbiDecoded,
    public stats?: SimulationStats,
  ) {}

  static get schema(): ZodFor<UtilitySimulationResult> {
    return z
      .object({
        result: AbiDecodedSchema,
        stats: optional(SimulationStatsSchema),
      })
      .transform(({ result, stats }) => new UtilitySimulationResult(result, stats));
  }

  static random(): UtilitySimulationResult {
    return new UtilitySimulationResult(Fr.random().toBigInt(), {
      nodeRPCCalls: { getBlockHeader: { times: [1] } },
      timings: {
        sync: 1,
        publicSimulation: 1,
        validation: 1,
        perFunction: [
          {
            functionName: 'random',
            time: 1,
          },
        ],
        unaccounted: 1,
        total: 5,
      },
    });
  }
}
