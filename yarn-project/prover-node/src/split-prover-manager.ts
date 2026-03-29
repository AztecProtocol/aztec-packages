import type { CheckpointSubTreeOrchestrator, TopTreeOrchestrator } from '@aztec/prover-client/orchestrator';
import type { EpochProverManager } from '@aztec/stdlib/interfaces/server';

/** Facade lifecycle handle — must be started before use and stopped when done. */
export interface FacadeHandle {
  start(): void | Promise<void>;
  stop(): Promise<void>;
}

/** Extended prover manager with split proving support. */
export interface SplitProverManager extends EpochProverManager {
  createCheckpointSubTreeProver(): { orchestrator: CheckpointSubTreeOrchestrator; facade: FacadeHandle };
  createTopTreeProver(): { orchestrator: TopTreeOrchestrator; facade: FacadeHandle };
}

/** Type guard to check if a prover manager supports split proving. */
export function isSplitProverManager(prover: EpochProverManager): prover is SplitProverManager {
  return (
    typeof (prover as SplitProverManager).createCheckpointSubTreeProver === 'function' &&
    typeof (prover as SplitProverManager).createTopTreeProver === 'function'
  );
}
