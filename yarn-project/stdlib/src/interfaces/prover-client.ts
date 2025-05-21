import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/fields';

import { z } from 'zod';

import { type ZodFor, schemas } from '../schemas/index.js';
import type { TxHash } from '../tx/tx_hash.js';
import type { EpochProver } from './epoch-prover.js';
import type { ProvingJobConsumer } from './prover-broker.js';

export type ActualProverConfig = {
  /** Whether to construct real proofs */
  realProofs: boolean;
  /** The type of artificial delay to introduce */
  proverTestDelayType: 'fixed' | 'realistic';
  /** If using fixed delay, the time each operation takes. */
  proverTestDelayMs: number;
  /** If using realistic delays, what percentage of realistic times to apply. */
  proverTestDelayFactor: number;
};

/**
 * The prover configuration.
 */
export type ProverConfig = ActualProverConfig & {
  /** The URL to the Aztec node to take proving jobs from */
  nodeUrl?: string;
  /** Identifier of the prover */
  proverId?: Fr;
  /** Number of proving agents to start within the prover. */
  proverAgentCount: number;
  /** Store for failed proof inputs. */
  failedProofStore?: string;
};

export const ProverConfigSchema = z.object({
  nodeUrl: z.string().optional(),
  realProofs: z.boolean(),
  proverId: schemas.Fr.optional(),
  proverTestDelayType: z.enum(['fixed', 'realistic']),
  proverTestDelayMs: z.number(),
  proverTestDelayFactor: z.number(),
  proverAgentCount: z.number(),
}) satisfies ZodFor<ProverConfig>;

export const proverConfigMappings: ConfigMappingsType<ProverConfig> = {
  nodeUrl: {
    env: 'AZTEC_NODE_URL',
    description: 'The URL to the Aztec node to take proving jobs from',
  },
  realProofs: {
    env: 'PROVER_REAL_PROOFS',
    description: 'Whether to construct real proofs',
    ...booleanConfigHelper(true),
  },
  proverId: {
    env: 'PROVER_ID',
    parseEnv: (val?: string) => parseProverId(val),
    description: 'Hex value that identifies the prover. Defaults to the address used for submitting proofs if not set.',
  },
  proverTestDelayType: {
    env: 'PROVER_TEST_DELAY_TYPE',
    description: 'The type of artificial delay to introduce',
  },
  proverTestDelayMs: {
    env: 'PROVER_TEST_DELAY_MS',
    description: 'Artificial delay to introduce to all operations to the test prover.',
    ...numberConfigHelper(0),
  },
  proverTestDelayFactor: {
    env: 'PROVER_TEST_DELAY_FACTOR',
    description: 'If using realistic delays, what percentage of realistic times to apply.',
    ...numberConfigHelper(1),
  },
  proverAgentCount: {
    env: 'PROVER_AGENT_COUNT',
    description: 'The number of prover agents to start',
    ...numberConfigHelper(1),
  },
  failedProofStore: {
    env: 'PROVER_FAILED_PROOF_STORE',
    description:
      'Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.',
  },
};

function parseProverId(str?: string) {
  if (!str) {
    return undefined;
  }
  return Fr.fromHexString(str);
}

/**
 * The interface to the prover client.
 * Provides the ability to generate proofs and build rollups.
 */
export interface EpochProverManager {
  createEpochProver(): EpochProver;

  start(): Promise<void>;

  stop(): Promise<void>;

  getProvingJobSource(): ProvingJobConsumer;

  getProverId(): Fr;

  updateProverConfig(config: Partial<ProverConfig>): Promise<void>;
}

export class BlockProofError extends Error {
  static #name = 'BlockProofError';
  override name = BlockProofError.#name;

  constructor(
    message: string,
    public readonly txHashes: TxHash[],
  ) {
    super(message);
  }

  static isBlockProofError(err: any): err is BlockProofError {
    return err && typeof err === 'object' && err.name === BlockProofError.#name;
  }
}
