export interface BBConfig {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  /** Whether to skip tmp dir cleanup for debugging purposes */
  bbSkipCleanup: boolean;
  bbIVCConcurrency: number;
  /** Max concurrent verifications for the RPC verifier (QueuedIVCVerifier concurrency). Defaults to BB_NUM_IVC_VERIFIERS or 8. */
  bbRpcVerifyConcurrency: number;
  /** Max batch size for the peer chonk verifier (BatchChonkVerifier batch size). Defaults to BB_NUM_IVC_VERIFIERS or 8. */
  bbPeerVerifyBatchSize: number;
}

export interface ACVMConfig {
  /** The path to the ACVM binary */
  acvmBinaryPath: string;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory: string;
}
