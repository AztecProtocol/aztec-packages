export interface BBConfig {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  /** Whether to skip tmp dir cleanup for debugging purposes */
  bbSkipCleanup: boolean;
  /** Max concurrent verifications for the RPC verifier (QueuedIVCVerifier). */
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
  /** Thread count for the peer batch verifier parallel reduce. 0 = auto. */
  bbChonkVerifyConcurrency: number;
}

export interface ACVMConfig {
  /** The path to the ACVM binary */
  acvmBinaryPath: string;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory: string;
}
