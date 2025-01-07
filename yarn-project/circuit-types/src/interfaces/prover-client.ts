import { Fr } from '@aztec/circuits.js';
import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type TxHash } from '../tx/tx_hash.js';
import { type EpochProver } from './epoch-prover.js';
import { type ProvingJobConsumer } from './prover-broker.js';

export type ActualProverConfig = {
  /** Whether to construct real proofs */
  realProofs: boolean;
  /** Artificial delay to introduce to all operations to the test prover. */
  proverTestDelayMs: number;
};

/**
 * The prover configuration.
 */
export type ProverConfig = ActualProverConfig & {
  /** The URL to the Aztec node to take proving jobs from */
  nodeUrl?: string;
  /** Identifier of the prover */
  proverId: Fr;
  proverAgentCount: number;
};

export const ProverConfigSchema = z.object({
  nodeUrl: z.string().optional(),
  realProofs: z.boolean(),
  proverId: schemas.Fr,
  proverTestDelayMs: z.number(),
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
    ...booleanConfigHelper(),
  },
  proverId: {
    env: 'PROVER_ID',
    parseEnv: (val: string) => parseProverId(val),
    description: 'Identifier of the prover',
    defaultValue: Fr.ZERO,
  },
  proverTestDelayMs: {
    env: 'PROVER_TEST_DELAY_MS',
    description: 'Artificial delay to introduce to all operations to the test prover.',
    ...numberConfigHelper(0),
  },
  proverAgentCount: {
    env: 'PROVER_AGENT_COUNT',
    description: 'The number of prover agents to start',
    ...numberConfigHelper(1),
  },
};

function parseProverId(str: string) {
  return Fr.fromHexString(str.startsWith('0x') ? str : Buffer.from(str, 'utf8').toString('hex'));
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

  updateProverConfig(config: Partial<ProverConfig>): Promise<void>;
}

export class BlockProofError extends Error {
  static #name = 'BlockProofError';
  override name = BlockProofError.#name;

  constructor(message: string, public readonly txHashes: TxHash[]) {
    super(message);
  }

  static isBlockProofError(err: any): err is BlockProofError {
    return err && typeof err === 'object' && err.name === BlockProofError.#name;
  }
}
