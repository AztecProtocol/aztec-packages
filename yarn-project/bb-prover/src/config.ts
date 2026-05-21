export interface BBConfig {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  /** Whether to skip tmp dir cleanup for debugging purposes */
  bbSkipCleanup: boolean;
  /**
   * Number of long-lived bb processes pooled by the RPC verifier (BBCircuitVerifier).
   * Also caps concurrent verifications via the wrapping QueuedIVCVerifier.
   */
  numConcurrentIVCVerifiers: number;
  /** Thread count for the RPC IVC verifier. */
  bbIVCConcurrency: number;
  /**
   * Upper bound on proofs per batch for the peer chonk batch verifier.
   * Proofs are verified immediately as they arrive — this only caps how many
   * can accumulate while a batch is already being processed.
   * Default 16: at 4 cores, a full batch of 16 verifies in ~245ms wall time.
   */
  bbChonkVerifyMaxBatch: number;
  /** Thread count for the peer batch verifier parallel reduce. Default 6 to leave cores for the rest of the node. */
  bbChonkVerifyConcurrency: number;
  /** When set, bb.js operations write input/output files and log equivalent CLI commands to this directory. */
  bbDebugOutputDir?: string;
}

export interface ACVMConfig {
  /** The path to the ACVM binary */
  acvmBinaryPath: string;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory: string;
}
