import type { Tracer } from '@aztec/telemetry-client';

export interface ExecutorMetricsInterface {
  tracer: Tracer | undefined;
  startRecordingTxSimulation(txLabel: string): void;
  stopRecordingTxSimulation(txLabel: string, durationMs: number): void;
  recordEnqueuedCallSimulation(fnName: string, durationMs: number, manaUsed: number, totalInstructions: number): void;
  recordEnqueuedCallSimulationFailure(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructions: number,
  ): void;
  recordTxHashComputation(durationMs: number): void;
  recordPrivateEffectsInsertion(durationUs: number, type: 'revertible' | 'non-revertible'): void;
}
