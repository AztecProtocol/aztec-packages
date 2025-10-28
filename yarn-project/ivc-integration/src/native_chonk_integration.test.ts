import { BB_RESULT, verifyChonkProof } from '@aztec/bb-prover';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

import { getWorkingDirectory } from './bb_working_directory.js';
import { proveChonk } from './prove_native.js';
import { generateTestingIVCStack } from './witgen.js';

const logger = createLogger('ivc-integration:test:native');

jest.setTimeout(120_000);

describe('chonk Integration', () => {
  let bbWorkingDirectory: string;
  let bbBinaryPath: string;

  beforeEach(async () => {
    // Create a temp working dir
    bbWorkingDirectory = await getWorkingDirectory('bb-chonk-integration-');
    bbBinaryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../barretenberg/cpp/build/bin', 'bb');
  });

  // This test will verify a chonk proof of a simple tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run the tail kernel to finish the chonk chain.
  // 4. Run the hiding kernel.
  it('Should generate a verifiable chonk proof from a simple mock tx', async () => {
    const [bytecodes, witnessStack, _, vks] = await generateTestingIVCStack(1, 0);

    await proveChonk(bbBinaryPath, bbWorkingDirectory, witnessStack, bytecodes, vks, logger);

    const verifyResult = await verifyChonkProof(
      bbBinaryPath,
      bbWorkingDirectory.concat('/proof'),
      bbWorkingDirectory.concat('/vk'),
      logger.info,
    );
    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });

  // This test will verify a chonk proof of a more complex tx:
  // 1. Run a mock app that creates two commitments
  // 2. Run the init kernel to process the app run
  // 3. Run a mock app that reads one of those commitments
  // 4. Run the inner kernel to process the second app run
  // 5. Run the reset kernel to process the read request emitted by the reader app
  // 6. Run the tail kernel to finish the chonk chain
  // 7. Run the hiding kernel.
  it('Should generate a verifiable chonk proof from a complex mock tx', async () => {
    const [bytecodes, witnessStack, _, vks] = await generateTestingIVCStack(1, 1);

    await proveChonk(bbBinaryPath, bbWorkingDirectory, witnessStack, bytecodes, vks, logger);

    const verifyResult = await verifyChonkProof(
      bbBinaryPath,
      bbWorkingDirectory.concat('/proof'),
      bbWorkingDirectory.concat('/vk'),
      logger.info,
    );
    expect(verifyResult.status).toEqual(BB_RESULT.SUCCESS);
  });
});
