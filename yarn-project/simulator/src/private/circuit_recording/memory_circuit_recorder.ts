import { CircuitRecorder } from './circuit_recorder.js';

/*
 * In memory circuit recorder uses the default implementation. This is kept
 * while we decide the fate of the FileCircuitRecorder
 */
export class MemoryCircuitRecorder extends CircuitRecorder {
  constructor() {
    super();
  }
}
