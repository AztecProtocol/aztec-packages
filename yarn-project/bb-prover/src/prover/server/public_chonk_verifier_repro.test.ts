import { randomBytes } from '@aztec/foundation/crypto/random';
import { createLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';
import { getProvingJobInputClassFor } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { PublicChonkVerifierPrivateInputs } from '@aztec/stdlib/rollup';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { promises as fs } from 'fs';
import path from 'path';

import { BBNativeRollupProver, type BBProverConfig } from '../../index.js';

const logger = createLogger('bb-prover:test:public-chonk-verifier-repro');

// Real failing PUBLIC_CHONK_VERIFIER input captured from staging-internal (build 5.0.0-nightly.20260612,
// epoch 3, tx 0x21a7d8e3...). It is exactly the buffer that FileStoreProofStore.saveProofInput wrote
// (`inputs.toBuffer()` of a PublicChonkVerifierPrivateInputs) via the failed-proof upload path.
const FIXTURE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'chonk_fail_input');

// Repo root, used to locate the native bb / acvm binaries when env overrides are not set.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/**
 * Loads the fixture and decodes it back into a PublicChonkVerifierPrivateInputs. This replicates the
 * inverse of the failed-proof upload path: FileStoreProofStore.getProofInput reads the saved buffer
 * and calls `getProvingJobInputClassFor(type).fromBuffer(buffer)` for the type encoded in the URI.
 */
async function loadFailingInputs(): Promise<PublicChonkVerifierPrivateInputs> {
  const buffer = await fs.readFile(FIXTURE_PATH);
  const inputClass = getProvingJobInputClassFor(ProvingRequestType.PUBLIC_CHONK_VERIFIER);
  expect(inputClass).toBe(PublicChonkVerifierPrivateInputs);
  return inputClass.fromBuffer(buffer) as PublicChonkVerifierPrivateInputs;
}

async function getBBProverConfig(): Promise<BBProverConfig | undefined> {
  const bbBinaryPath = process.env.BB_BINARY_PATH ?? path.join(REPO_ROOT, 'barretenberg/cpp/build/bin/bb-avm');
  const acvmBinaryPath = process.env.ACVM_BINARY_PATH ?? path.join(REPO_ROOT, 'noir/noir-repo/target/release/acvm');
  try {
    await fs.access(bbBinaryPath, fs.constants.R_OK);
    await fs.access(acvmBinaryPath, fs.constants.R_OK);
  } catch (err) {
    logger.error(`Native bb/acvm binaries not available: ${err}`);
    return undefined;
  }

  const workingDir = path.join('/tmp', randomBytes(4).toString('hex'));
  return {
    acvmBinaryPath,
    acvmWorkingDirectory: path.join(workingDir, 'acvm'),
    bbBinaryPath,
    bbWorkingDirectory: path.join(workingDir, 'bb'),
    bbSkipCleanup: false,
    numConcurrentIVCVerifiers: 1,
    bbIVCConcurrency: 1,
    bbChonkVerifyMaxBatch: 16,
    bbChonkVerifyConcurrency: 6,
  };
}

describe('prover/bb_prover/public-chonk-verifier-repro', () => {
  let prover: BBNativeRollupProver;
  let inputs: PublicChonkVerifierPrivateInputs;

  beforeAll(async () => {
    const config = await getBBProverConfig();
    if (!config) {
      throw new Error(
        'Native bb/acvm binaries not found. Build barretenberg + noir first, or set BB_BINARY_PATH / ACVM_BINARY_PATH.',
      );
    }
    prover = await BBNativeRollupProver.new(config, getTelemetryClient());
    inputs = await loadFailingInputs();
    logger.info(`Loaded failing PublicChonkVerifier input with proverId ${inputs.proverId.toString()}`);
  });

  // The captured input is a real public tx whose Chonk recursive proof does not satisfy the build's
  // bundled VK. `getPublicChonkVerifierProof` generates the proof and then self-verifies it, throwing
  // `ProvingError('Failed to verify proof from key!')` when verification returns false.
  //
  // RED repro: this test asserts the CURRENT (buggy) behavior — the call REJECTS. When the underlying
  // circuit/VK bug is fixed, this expectation will start failing; flip it to a `resolves` assertion
  // (or assert on the returned proof) to confirm the fix.
  it(
    'fails to verify the PublicChonkVerifier proof for the captured failing input',
    async () => {
      await expect(prover.getPublicChonkVerifierProof(inputs)).rejects.toThrow('Failed to verify proof from key!');
    },
    30 * 60 * 1000,
  );
});
