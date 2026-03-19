export interface BBConfig {
  bbBinaryPath: string;
  bbWorkingDirectory: string;
  /** Whether to skip tmp dir cleanup for debugging purposes */
  bbSkipCleanup: boolean;
  numConcurrentIVCVerifiers: number;
  bbIVCConcurrency: number;
  /** Batch size for RPC proof verification (QueuedIVCVerifier concurrency). */
  bbRpcVerifyBatchSize: number;
  /** Batch size for P2P peer proof verification (BatchChonkVerifier batch). */
  bbPeerVerifyBatchSize: number;
}

export interface ACVMConfig {
  /** The path to the ACVM binary */
  acvmBinaryPath: string;
  /** The working directory to use for simulation/proving */
  acvmWorkingDirectory: string;
}
