import { type BlockProver } from './block-prover.js';
import { type ProvingJobSource } from './proving-job.js';
import { type ClientProtocolCircuitVerifier } from './server_circuit_prover.js';

/**
 * The prover configuration.
 */
export type ProverConfig = {
  /** How many agents to run */
  proverAgents: number;
  /** Whether to construct real proofs */
  realProofs: boolean;
};

/**
 * The interface to the prover client.
 * Provides the ability to generate proofs and build rollups.
 */
export interface ProverClient extends BlockProver, ClientProtocolCircuitVerifier {
  start(): Promise<void>;

  stop(): Promise<void>;

  getProvingJobSource(): ProvingJobSource;

  updateProverConfig(config: Partial<ProverConfig>): Promise<void>;
}
