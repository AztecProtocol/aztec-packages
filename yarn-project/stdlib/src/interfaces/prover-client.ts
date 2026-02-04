import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import { schemas, zodFor } from '../schemas/index.js';
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
  /**
   * Whether to abort pending proving jobs when the orchestrator is cancelled.
   * When false (default), jobs remain in the broker queue and can be reused on restart/reorg.
   * When true, jobs are explicitly cancelled with the broker, which prevents reuse.
   */
  cancelJobsOnStop: boolean;
};

/**
 * The prover configuration.
 */
export type ProverConfig = ActualProverConfig & {
  /** The URL to the Aztec node to take proving jobs from */
  nodeUrl?: string;
  /** Identifier of the prover */
  proverId?: EthAddress;
  /** Number of proving agents to start within the prover. */
  proverAgentCount: number;
  /** Where to store proving request. Must be accessible to both prover node and agents. If not set will inline-encode the parameters */
  proofStore?: string;
  /** Store for failed proof inputs. */
  failedProofStore?: string;
};

export const ProverConfigSchema = zodFor<ProverConfig>()(
  z.object({
    nodeUrl: z.string().optional(),
    realProofs: z.boolean(),
    proverId: schemas.EthAddress.optional(),
    proverTestDelayType: z.enum(['fixed', 'realistic']),
    proverTestDelayMs: z.number(),
    proverTestDelayFactor: z.number(),
    proverAgentCount: z.number(),
    proofStore: z.string().optional(),
    failedProofStore: z.string().optional(),
    cancelJobsOnStop: z.boolean(),
  }),
);

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
  proofStore: {
    env: 'PROVER_PROOF_STORE',
    description: 'Optional proof input store for the prover',
  },
  failedProofStore: {
    env: 'PROVER_FAILED_PROOF_STORE',
    description:
      'Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.',
  },
  cancelJobsOnStop: {
    env: 'PROVER_CANCEL_JOBS_ON_STOP',
    description:
      'Whether to abort pending proving jobs when the orchestrator is cancelled. ' +
      'When false (default), jobs remain in the broker queue and can be reused on restart/reorg. ' +
      'When true, jobs are explicitly cancelled with the broker, which prevents reuse.',
    ...booleanConfigHelper(false),
  },
};

function parseProverId(str?: string) {
  if (!str) {
    return undefined;
  }
  return EthAddress.fromString(str);
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

  getProverId(): EthAddress;

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
