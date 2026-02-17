import { Fr } from '@aztec/foundation/curves/bn254';
import { type ZodFor, optional, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { AztecNode } from '../interfaces/aztec-node.js';
import { type PrivateExecutionStep, PrivateExecutionStepSchema } from '../kernel/private_kernel_prover_output.js';

export type RoundTripStats = {
  /** Number of round trips (times we blocked waiting for node responses) */
  roundTrips: number;
  /** Total wall-clock time spent waiting on node (excludes parallel overlap) */
  totalBlockingTime: number;
  /** Individual round trip durations */
  roundTripDurations: number[];
  /** Methods called in each round trip (parallel calls grouped together) */
  roundTripMethods: string[][];
};

const RoundTripStatsSchema = z.object({
  roundTrips: z.number(),
  totalBlockingTime: z.number(),
  roundTripDurations: z.array(z.number()),
  roundTripMethods: z.array(z.array(z.string())),
});

export type NodeStats = {
  /** Per-method call stats */
  perMethod: Partial<Record<keyof AztecNode, { times: number[] }>>;
  /** Round trip stats tracking actual blocking waits */
  roundTrips: RoundTripStats;
};

const NodeStatsSchema = z.object({
  perMethod: z.record(z.string(), z.object({ times: z.array(z.number()) })),
  roundTrips: RoundTripStatsSchema,
});

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
        nodeRPCCalls: {
          perMethod: { getBlockHeader: { times: [1] } },
          roundTrips: {
            roundTrips: 1,
            totalBlockingTime: 1,
            roundTripDurations: [1],
            roundTripMethods: [['getBlockHeader']],
          },
        },
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
    public result: Fr[],
    public stats?: SimulationStats,
  ) {}

  static get schema(): ZodFor<UtilitySimulationResult> {
    return z
      .object({
        result: z.array(schemas.Fr),
        stats: optional(SimulationStatsSchema),
      })
      .transform(({ result, stats }) => new UtilitySimulationResult(result, stats));
  }

  static random(): UtilitySimulationResult {
    return new UtilitySimulationResult([Fr.random()], {
      nodeRPCCalls: {
        perMethod: { getBlockHeader: { times: [1] } },
        roundTrips: {
          roundTrips: 1,
          totalBlockingTime: 1,
          roundTripDurations: [1],
          roundTripMethods: [['getBlockHeader']],
        },
      },
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
