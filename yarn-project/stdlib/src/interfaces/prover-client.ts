import {
  type ConfigMappingsType,
  booleanConfigHelper,
  composeConfigMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import { type NodeUrlConfig, nodeUrlConfigMappings } from '../config/index.js';
import { schemas, zodFor } from '../schemas/index.js';
import type { TxHash } from '../tx/tx_hash.js';
import type { EpochProver } from './epoch-prover.js';
import type { ProvingJobConsumer } from './prover-broker.js';

/** Prover settings shared by the in-process orchestrator and standalone prover agents. */
export interface ProverAgentSharedConfig {
  proverAgentCount: number;
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
  /** Where to store proving request. Must be accessible to both prover node and agents. If not set will inline-encode the parameters */
  proofStore?: string;
}

export const proverAgentSharedConfigMappings: ConfigMappingsType<ProverAgentSharedConfig> = {
  realProofs: {
    env: 'PROVER_REAL_PROOFS',
    description: 'Whether to construct real proofs',
    ...booleanConfigHelper(true),
  },
  proverTestDelayType: {
    env: 'PROVER_TEST_DELAY_TYPE',
    description: 'The type of artificial delay to introduce',
    defaultValue: 'fixed' as const,
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
  cancelJobsOnStop: {
    env: 'PROVER_CANCEL_JOBS_ON_STOP',
    description:
      'Whether to abort pending proving jobs when the orchestrator is cancelled. ' +
      'When false (default), jobs remain in the broker queue and can be reused on restart/reorg. ' +
      'When true, jobs are explicitly cancelled with the broker, which prevents reuse.',
    ...booleanConfigHelper(false),
  },
};

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
  /** Max concurrent jobs the orchestrator serializes and enqueues to the broker. */
  enqueueConcurrency: number;
};

export type ProverOrchestratorConfig = {
  /** Identifier of the prover */
  proverId?: EthAddress;
  /** Store for failed proof inputs. */
  failedProofStore?: string;
  /** Max concurrent jobs the orchestrator serializes and enqueues to the broker. */
  enqueueConcurrency: number;
};

/** The prover configuration. */
export type ProverConfig = ProverAgentSharedConfig & ProverOrchestratorConfig & Partial<NodeUrlConfig>;

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
    enqueueConcurrency: z.number(),
  }),
);

const proverOrchestratorConfigMappings: ConfigMappingsType<ProverOrchestratorConfig> = {
  proverId: {
    env: 'PROVER_ID',
    parseEnv: (val: string) => parseProverId(val),
    description: 'Hex value that identifies the prover. Defaults to the address used for submitting proofs if not set.',
  },
  failedProofStore: {
    env: 'PROVER_FAILED_PROOF_STORE',
    description:
      'Store for failed proof inputs. Google cloud storage is only supported at the moment. Set this value as gs://bucket-name/path/to/store.',
  },
  enqueueConcurrency: {
    env: 'PROVER_ENQUEUE_CONCURRENCY',
    description: 'Max concurrent jobs the orchestrator serializes and enqueues to the broker.',
    ...numberConfigHelper(50),
  },
};

export const proverConfigMappings: ConfigMappingsType<ProverConfig> = composeConfigMappings(
  nodeUrlConfigMappings,
  proverAgentSharedConfigMappings,
  proverOrchestratorConfigMappings,
);

function parseProverId(str: string) {
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
