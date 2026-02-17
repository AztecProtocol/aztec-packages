import type { RevertCode } from '@aztec/stdlib/avm';
import type { GasUsed } from '@aztec/stdlib/gas';

export interface ExecutorMetricsInterface {
  startRecordingTxSimulation(txLabel: string): void;
  stopRecordingTxSimulation(txLabel: string, gasUsed?: GasUsed, revertedCode?: RevertCode): void;
  recordEnqueuedCallSimulation(fnName: string, durationMs: number, manaUsed: number, totalInstructions: number): void;
  recordEnqueuedCallSimulationFailure(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructionsExecuted: number,
  ): void;
  recordPrivateEffectsInsertion(durationUs: number, type: 'revertible' | 'non-revertible'): void;
}
