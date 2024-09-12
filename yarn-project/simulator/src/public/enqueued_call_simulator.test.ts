import { makePublicKernelCircuitPublicInputs } from '@aztec/circuits.js/testing';

import { EnqueuedCallSimulator } from './enqueued_call_simulator.js';

describe('EnqueuedCallSimulator utils', () => {
  describe('getMaxSideEffectCounter', () => {
    it('correctly identifies the highest side effect counter in a transaction', () => {
      const inputs = makePublicKernelCircuitPublicInputs();

      const startingCounter = EnqueuedCallSimulator.getMaxSideEffectCounter(inputs);

      inputs.endNonRevertibleData.noteHashes.at(-1)!.noteHash.counter = startingCounter + 1;
      expect(EnqueuedCallSimulator.getMaxSideEffectCounter(inputs)).toBe(startingCounter + 1);

      inputs.endNonRevertibleData.publicCallStack.at(-1)!.counter = startingCounter + 2;
      expect(EnqueuedCallSimulator.getMaxSideEffectCounter(inputs)).toBe(startingCounter + 2);

      inputs.end.noteHashes.at(-1)!.noteHash.counter = startingCounter + 3;
      expect(EnqueuedCallSimulator.getMaxSideEffectCounter(inputs)).toBe(startingCounter + 3);

      inputs.end.nullifiers.at(-1)!.counter = startingCounter + 4;
      expect(EnqueuedCallSimulator.getMaxSideEffectCounter(inputs)).toBe(startingCounter + 4);
    });
  });
});
