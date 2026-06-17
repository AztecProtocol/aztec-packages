import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';

import type { ACIRCallback, ACIRExecutionResult } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';
import type { CircuitSimulator } from '../circuit_simulator.js';
import type { RecordingMetadata } from './circuit_recorder.js';
import { FileCircuitRecorder } from './file_circuit_recorder.js';
import { MemoryCircuitRecorder } from './memory_circuit_recorder.js';
import { SimulatorRecorderWrapper } from './simulator_recorder_wrapper.js';

const witness = () => new Map<number, string>() as ACVMWitness;
const meta = (circuitName: string): RecordingMetadata => ({
  input: witness(),
  bytecode: Buffer.from(circuitName),
  circuitName,
  functionName: 'main',
});

describe('CircuitRecorder', () => {
  describe('recordCall outside an active recording', () => {
    // recordCall must never throw when there is no recording in context (e.g. a stray call after the scope closed):
    // it returns the entry it would have recorded without pushing it anywhere.
    const expectedEntry = { name: 'loadCapsule', inputs: [['0x01']], outputs: ['0x02'], time: 5, stackDepth: 0 };

    it('MemoryCircuitRecorder.recordCall() returns the entry without pushing to an absent recording', async () => {
      const recorder = new MemoryCircuitRecorder();

      await expect(recorder.recordCall('loadCapsule', [['0x01']], ['0x02'], 5)).resolves.toEqual(expectedEntry);
    });

    it('FileCircuitRecorder.recordCall() returns the entry without touching the recording file', async () => {
      const recorder = new FileCircuitRecorder('/tmp/circuit-recorder-test-unused');

      await expect(recorder.recordCall('loadCapsule', [['0x01']], ['0x02'], 5)).resolves.toEqual(expectedEntry);
    });
  });

  describe('record', () => {
    it('isolates oracle calls between concurrent recordings sharing one recorder', async () => {
      const recorder = new MemoryCircuitRecorder();
      let releaseA: () => void;
      const gateA = new Promise<void>(resolve => (releaseA = resolve));

      // A records a1, suspends so B interleaves, then records a2. With a single shared recording this corrupts; with
      // a per-recording context each recording sees only its own calls regardless of interleaving.
      const a = recorder.record(meta('A'), async () => {
        await recorder.recordCall('a1', [], [], 0);
        await gateA;
        await recorder.recordCall('a2', [], [], 0);
        return 'A';
      });
      const b = recorder.record(meta('B'), async () => {
        await recorder.recordCall('b1', [], [], 0);
        releaseA();
        return 'B';
      });

      const [resultA, resultB] = await Promise.all([a, b]);
      expect(resultA.recording.oracleCalls.map(o => o.name)).toEqual(['a1', 'a2']);
      expect(resultB.recording.oracleCalls.map(o => o.name)).toEqual(['b1']);
    });

    it('attaches the error to the recording and re-throws it unchanged', async () => {
      const recorder = new MemoryCircuitRecorder();
      const underlyingError = new Error('schnorr_initializerless: capsule load failed');

      await expect(recorder.record(meta('X'), () => Promise.reject(underlyingError))).rejects.toBe(underlyingError);
    });
  });
});

describe('SimulatorRecorderWrapper', () => {
  const artifact = (name: string) =>
    ({ bytecode: Buffer.from(name), contractName: 'TestContract', name }) as FunctionArtifactWithContractName;

  it('surfaces the original simulator error instead of masking it', async () => {
    const underlyingError = new Error('schnorr_initializerless: capsule load failed');
    const simulator: CircuitSimulator = {
      executeUserCircuit: () => Promise.reject(underlyingError),
      executeProtocolCircuit: () => Promise.reject(new Error('not used in this test')),
    };
    const wrapper = new SimulatorRecorderWrapper(simulator, new MemoryCircuitRecorder());

    await expect(wrapper.executeUserCircuit(witness(), artifact('test_fn'), {})).rejects.toThrow(
      'schnorr_initializerless: capsule load failed',
    );
  });

  // A top-level circuit makes a nested private call (via the aztec_prv_callPrivateFunction oracle, which re-enters
  // the simulator) followed by a utility execution (a direct re-entry, as utility_execution_oracle.ts does). Each
  // re-entry shares the same recorder, so oracle calls must stay attributed to the circuit that made them and the
  // parent recording must survive its children.
  it('attributes oracle calls to the right circuit across nested private and utility re-entries', async () => {
    const recorder = new MemoryCircuitRecorder();
    const oracle = (): ReturnType<ACIRCallback[string]> => Promise.resolve([]);

    let childResult: ACIRExecutionResult | undefined;
    let utilityResult: ACIRExecutionResult | undefined;

    // Indirection so the scripted simulator and callbacks can re-enter through the recorder-wrapped simulator, which
    // is constructed below (it wraps `simulator`, so the two reference each other).
    const reentry: { wrapper?: CircuitSimulator } = {};

    const childCallback: ACIRCallback = { childOracle: oracle };
    const utilityCallback: ACIRCallback = { utilityOracle: oracle };
    const parentCallback: ACIRCallback = { getNotes: oracle, getMore: oracle };
    // The wrapped aztec_prv_callPrivateFunction triggers a nested circuit execution, mirroring private_execution.ts.
    parentCallback['aztec_prv_callPrivateFunction'] = async () => {
      childResult = await reentry.wrapper!.executeUserCircuit(witness(), artifact('child'), childCallback);
      return [];
    };

    const simulator: CircuitSimulator = {
      executeProtocolCircuit: () => Promise.reject(new Error('not used in this test')),
      executeUserCircuit: async (_input, artifactArg, callback) => {
        switch (artifactArg.name) {
          case 'parent':
            await callback.getNotes();
            await callback['aztec_prv_callPrivateFunction']();
            // Utility re-entry: a direct nested executeUserCircuit, not via aztec_prv_callPrivateFunction.
            utilityResult = await reentry.wrapper!.executeUserCircuit(witness(), artifact('utility'), utilityCallback);
            await callback.getMore();
            break;
          case 'child':
            await callback.childOracle();
            break;
          case 'utility':
            await callback.utilityOracle();
            break;
        }
        return { partialWitness: new Map(), returnWitness: new Map() } as ACIRExecutionResult;
      },
    };

    reentry.wrapper = new SimulatorRecorderWrapper(simulator, recorder);
    const parentResult = await reentry.wrapper.executeUserCircuit(witness(), artifact('parent'), parentCallback);

    // The parent recording survives both children, with only the parent's own oracle calls attributed to it.
    expect(parentResult.oracles).toBeDefined();
    expect(Object.keys(parentResult.oracles!).sort()).toEqual(['aztec_prv_callPrivateFunction', 'getMore', 'getNotes']);
    // Each child circuit only sees its own oracle call, not the parent's.
    expect(Object.keys(childResult!.oracles!)).toEqual(['childOracle']);
    expect(Object.keys(utilityResult!.oracles!)).toEqual(['utilityOracle']);
  });
});
