import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';

import type { CircuitSimulator } from '../circuit_simulator.js';
import { FileCircuitRecorder } from './file_circuit_recorder.js';
import { MemoryCircuitRecorder } from './memory_circuit_recorder.js';
import { SimulatorRecorderWrapper } from './simulator_recorder_wrapper.js';

describe('CircuitRecorder', () => {
  describe('finalizing without an active recording', () => {
    it('finish() resolves to undefined instead of dereferencing an absent recording', async () => {
      const recorder = new MemoryCircuitRecorder();

      await expect((async () => await recorder.finish())()).resolves.toBeUndefined();
    });

    it('finishWithError() resolves to undefined rather than throwing while decorating an absent recording', async () => {
      const recorder = new MemoryCircuitRecorder();

      await expect(recorder.finishWithError(new Error('underlying noir failure'))).resolves.toBeUndefined();
    });
  });
});

describe('recordCall without an active recording', () => {
  // Under concurrent use the shared recorder can be reset (recording === undefined) between an oracle returning
  // and its recordCall() bookkeeping. recordCall() must not throw into the execution path; dropped recorder data is
  // acceptable until recorder state is isolated.
  const expectedEntry = { name: 'loadCapsule', inputs: [['0x01']], outputs: ['0x02'], time: 5, stackDepth: 0 };

  it('MemoryCircuitRecorder.recordCall() returns the entry without pushing to an absent recording', async () => {
    const recorder = new MemoryCircuitRecorder();

    await expect((async () => await recorder.recordCall('loadCapsule', [['0x01']], ['0x02'], 5, 0))()).resolves.toEqual(
      expectedEntry,
    );
  });

  it('FileCircuitRecorder.recordCall() returns the entry without touching the recording file', async () => {
    const recorder = new FileCircuitRecorder('/tmp/circuit-recorder-test-unused');

    await expect((async () => await recorder.recordCall('loadCapsule', [['0x01']], ['0x02'], 5, 0))()).resolves.toEqual(
      expectedEntry,
    );
  });
});

describe('SimulatorRecorderWrapper', () => {
  // Models the production state where start() leaves no active recording (newCircuit === false), so the error
  // path reaches finishWithError() with `recording` undefined.
  class NoStartRecorder extends MemoryCircuitRecorder {
    override start(): Promise<void> {
      return Promise.resolve();
    }
  }

  it('surfaces the original simulator error instead of masking it when there is no active recording', async () => {
    const underlyingError = new Error('schnorr_initializerless: capsule load failed');
    const simulator: CircuitSimulator = {
      executeUserCircuit: () => Promise.reject(underlyingError),
      executeProtocolCircuit: () => Promise.reject(new Error('not used in this test')),
    };
    const wrapper = new SimulatorRecorderWrapper(simulator, new NoStartRecorder());
    const artifact = {
      bytecode: Buffer.alloc(0),
      contractName: 'TestContract',
      name: 'test_fn',
    } as FunctionArtifactWithContractName;

    await expect(wrapper.executeUserCircuit(new Map<number, string>(), artifact, {})).rejects.toThrow(
      'schnorr_initializerless: capsule load failed',
    );
  });
});
