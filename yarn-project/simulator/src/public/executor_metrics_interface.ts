import type { RevertCode } from '@aztec/stdlib/avm';

export interface ExecutorMetricsInterface {
  startRecordingTxSimulation(txLabel: string): void;
  stopRecordingTxSimulation(txLabel: string, revertedCode?: RevertCode): void;
  recordEnqueuedCallSimulation(fnName: string, durationMs: number, manaUsed: number, totalInstructions: number): void;
  recordEnqueuedCallSimulationFailure(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructionsExecuted: number,
  ): void;
  recordTxHashComputation(durationMs: number): void;
  recordPrivateEffectsInsertion(durationUs: number, type: 'revertible' | 'non-revertible'): void;
}
