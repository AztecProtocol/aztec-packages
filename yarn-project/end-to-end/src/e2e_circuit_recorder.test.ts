import { MAX_APPS_PER_KERNEL } from '@aztec/constants';

import fs from 'fs/promises';
import path from 'path';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

/**
 * Tests the circuit recorder is working as expected. To read more about it, check JSDoc of CircuitRecorder class.
 */
describe('Circuit Recorder', () => {
  const RECORD_DIR = './circuit_recordings';

  it('records circuit execution', async () => {
    // Set recording directory env var - this will activate the circuit recorder
    process.env.CIRCUIT_RECORD_DIR = RECORD_DIR;

    // Run setup which deploys an account contract and runs kernels
    const { teardown } = await setup(1, { ...AUTOMINE_E2E_OPTS });

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

    // Then we'll do the same for a protocol circuit. The orchestrator dispatches to one of the
    // init_K variants for the first kernel iteration, with K capped at MAX_APPS_PER_KERNEL.
    // Which K is picked depends on how many apps the flow's first batch contains, so accept any
    // init_K artifact whose K is within [1, MAX_APPS_PER_KERNEL]: that's the artifact name the
    // recorder will produce on disk.
    {
      // Match the recorder's `circuitName_functionName` filename: the recorder uses
      // `artifact.name`, which BundleArtifactProvider derives by stripping 'Artifact' from the
      // ClientProtocolArtifact key (e.g. 'PrivateKernelInit3Artifact' → 'PrivateKernelInit3'),
      // so there is no underscore between 'Init' and the digit.
      const initVariants = Array.from({ length: MAX_APPS_PER_KERNEL }, (_, i) =>
        i === 0 ? 'PrivateKernelInit' : `PrivateKernelInit${i + 1}`,
      );

      const files = await fs.readdir(RECORD_DIR);
      expect(files.length).toBeGreaterThan(0);

      const recordingFile = files.find(f => initVariants.some(name => f.startsWith(`${name}_main`)));
      expect(recordingFile).toBeDefined();

      const matchedVariant = initVariants.find(name => recordingFile!.startsWith(`${name}_main`));

      const recordingContent = await fs.readFile(path.join(RECORD_DIR, recordingFile!), 'utf8');
      const recording = JSON.parse(recordingContent);

      expect(recording).toMatchObject({
        circuitName: matchedVariant,
        functionName: 'main',
        inputs: expect.any(Object),
        oracleCalls: expect.any(Array),
      });
    }

    // Cleanup
    await fs.rm(RECORD_DIR, { recursive: true, force: true });
    delete process.env.CIRCUIT_RECORD_DIR;
    await teardown();
  }, 120_000);
});
