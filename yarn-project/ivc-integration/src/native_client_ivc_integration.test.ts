import { BB_RESULT, verifyClientIvcProof, writeClientIVCProofToOutputDirectory } from '@aztec/bb-prover';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import { getWorkingDirectory } from './bb_working_directory.js';
import { generate3FunctionTestingIVCStack, generate6FunctionTestingIVCStack } from './index.js';
import { proveClientIVC } from './prove_native.js';

const logger = createLogger('ivc-integration:test:native');

jest.setTimeout(120_000);

describe('Client IVC Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  beforeEach(async () => {
    // Create a temp working dir
    bbWorkingDirectory = await getWorkingDirectory('bb-client-ivc-integration-');
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
  });

  // This test will verify a client IVC proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the client IVC chain.
  it('Should generate a verifiable client IVC proof from a simple mock tx', async () => {
    const [bytecodes, witnessStack, _, vks] = await generate3FunctionTestingIVCStack();

    const proof = await proveClientIVC(bbBinaryPath, bbWorkingDirectory, witnessStack, bytecodes, vks, logger);
    await writeClientIVCProofToOutputDirectory(proof, bbWorkingDirectory);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      bbWorkingDirectory.concat('/proof'),
      bbWorkingDirectory.concat('/vk'),
      logger.info,
    );

    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });

  // This test will verify a client IVC proof of a more complex tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run a mock app that reads one of those commitments
  // 4. Run the inner kernel to process the second app run
  // 5. Run the reset kernel to process the read request emitted by the reader app
  // 6. Run the tail kernel to finish the client IVC chain
  it('Should generate a verifiable client IVC proof from a complex mock tx', async () => {
    const [bytecodes, witnessStack, _, vks] = await generate6FunctionTestingIVCStack();

    const proof = await proveClientIVC(bbBinaryPath, bbWorkingDirectory, witnessStack, bytecodes, vks, logger);
    await writeClientIVCProofToOutputDirectory(proof, bbWorkingDirectory);
    const verifyResult = await verifyClientIvcProof(
      bbBinaryPath,
      bbWorkingDirectory.concat('/proof'),
      bbWorkingDirectory.concat('/vk'),
      logger.info,
    );

    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });
});
