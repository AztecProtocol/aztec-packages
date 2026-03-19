export interface BBConfig {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  /** Whether to skip tmp dir cleanup for debugging purposes */
  bbSkipCleanup: boolean;
  /** Max concurrent verifications for the RPC verifier (QueuedIVCVerifier). */
  numConcurrentIVCVerifiers: number;
  /** Thread count for the RPC IVC verifier. */
  bbIVCConcurrency: number;
  /** Max proofs per batch for the peer chonk batch verifier. */
  bbChonkVerifyBatchSize: number;
  /** Thread count for the peer batch verifier parallel reduce. 0 = auto. */
  bbChonkVerifyConcurrency: number;
}

export interface ACVMConfig {
  /** The path to the ACVM binary */
  acvmBinaryPath: string;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory: string;
}
