import { MAX_APPS_PER_KERNEL } from '@aztec/constants';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';

import fs from 'fs/promises';
import path from 'path';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

/**
 * Tests the circuit recorder is working as expected. To read more about it, check JSDoc of CircuitRecorder class.
 */
// Tests that setting CIRCUIT_RECORD_DIR activates the CircuitRecorder and produces recording files
// for both user circuits (the SchnorrInitializerlessAccount entrypoint exercised by deploying a
// ChildContract) and protocol circuits (PrivateKernelInit variant). (v5: the default account is now
// initializerless, so the user circuit recorded is the entrypoint, not a SchnorrAccount constructor.)
// Uses setup(1, AUTOMINE_E2E_OPTS) with one node, automine sequencer, one account.
describe('Circuit Recorder', () => {
  const RECORD_DIR = './circuit_recordings';

  // Sets CIRCUIT_RECORD_DIR env var, runs setup + a ChildContract deploy to trigger circuit execution,
  // then asserts recording files exist for SchnorrInitializerlessAccount_entrypoint and a
  // PrivateKernelInit variant.
  it('records circuit execution', async () => {
    // Set recording directory env var - this will activate the circuit recorder
    process.env.CIRCUIT_RECORD_DIR = RECORD_DIR;

    // setup creates an initializerless account, which has no deployment tx. Deploying a contract from
    // it exercises the account entrypoint (a user circuit) and the private kernels (protocol circuits)
    const {
      teardown,
      wallet,
      accounts: [accountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS });
    await ChildContract.deploy(wallet).send({ from: accountAddress });

    // Check recording directory exists
    const dirExists = await fs.stat(RECORD_DIR).then(
      stats => stats.isDirectory(),
      () => false,
    );
    expect(dirExists).toBe(true);

    // Check recording file of a user circuit (the account contract entrypoint) exists and has expected content
    {
      const files = await fs.readdir(RECORD_DIR);
      expect(files.length).toBeGreaterThan(0);

      const recordingFile = files.find(f => f.startsWith('SchnorrInitializerlessAccount_entrypoint'));
      expect(recordingFile).toBeDefined();

      const recordingContent = await fs.readFile(path.join(RECORD_DIR, recordingFile!), 'utf8');
      const recording = JSON.parse(recordingContent);

      expect(recording).toMatchObject({
        circuitName: 'SchnorrInitializerlessAccount',
        functionName: 'entrypoint',
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
