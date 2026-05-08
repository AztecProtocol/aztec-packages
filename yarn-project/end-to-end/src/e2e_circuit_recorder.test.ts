import fs from 'fs/promises';
import path from 'path';

import { setup } from './fixtures/utils.js';

/**
 * Tests the circuit recorder is working as expected. To read more about it, check JSDoc of CircuitRecorder class.
 */
describe('Circuit Recorder', () => {
  const RECORD_DIR = './circuit_recordings';

  it('records circuit execution', async () => {
    // Set recording directory env var - this will activate the circuit recorder
    process.env.CIRCUIT_RECORD_DIR = RECORD_DIR;

    // The assertions below look for a `PrivateKernelInit_main` recording (the single-app init
    // kernel). With the default batch size of 3 the orchestrator picks `private_kernel_init_3`
    // instead. This test is about the recorder mechanism, not kernel batching, so pin the batch
    // size to 1 for the duration of the test.
    const originalBatchSize = process.env.PXE_KERNEL_BATCH_SIZE;
    process.env.PXE_KERNEL_BATCH_SIZE = '1';

    // Run setup which deploys an account contract and runs kernels
    const { teardown } = await setup(1);

    // Check recording directory exists
    const dirExists = await fs.stat(RECORD_DIR).then(
      stats => stats.isDirectory(),
      () => false,
    );
    expect(dirExists).toBe(true);

    // Check recording file of a user circuit (contract circuit) exists and has expected content
    {
      const files = await fs.readdir(RECORD_DIR);
      expect(files.length).toBeGreaterThan(0);

      const recordingFile = files.find(f => f.startsWith('SchnorrAccount_constructor'));
      expect(recordingFile).toBeDefined();

      const recordingContent = await fs.readFile(path.join(RECORD_DIR, recordingFile!), 'utf8');
      const recording = JSON.parse(recordingContent);

      expect(recording).toMatchObject({
        circuitName: 'SchnorrAccount',
        functionName: 'constructor',
        inputs: expect.any(Object),
        oracleCalls: expect.any(Array),
      });
    }

    // Then we'll do the same for a protocol circuit
    {
      const files = await fs.readdir(RECORD_DIR);
      expect(files.length).toBeGreaterThan(0);

      const recordingFile = files.find(f => f.startsWith('PrivateKernelInit_main'));
      expect(recordingFile).toBeDefined();

      const recordingContent = await fs.readFile(path.join(RECORD_DIR, recordingFile!), 'utf8');
      const recording = JSON.parse(recordingContent);

      expect(recording).toMatchObject({
        circuitName: 'PrivateKernelInit',
        functionName: 'main',
        inputs: expect.any(Object),
        oracleCalls: expect.any(Array),
      });
    }

    // Cleanup
    await fs.rm(RECORD_DIR, { recursive: true, force: true });
    delete process.env.CIRCUIT_RECORD_DIR;
    if (originalBatchSize === undefined) {
      delete process.env.PXE_KERNEL_BATCH_SIZE;
    } else {
      process.env.PXE_KERNEL_BATCH_SIZE = originalBatchSize;
    }
    await teardown();
  }, 60_000);
});
