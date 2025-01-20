import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { simulateAvmTestContractGenerateCircuitInputs } from '@aztec/simulator/public/fixtures';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { type BBSuccess, BB_RESULT, generateAvmProofV2, verifyAvmProofV2 } from '../bb/execute.js';

it('bulk_testing v2', async () => {
  const functionName = 'bulk_testing';
  const calldata = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
  const avmCircuitInputs = await simulateAvmTestContractGenerateCircuitInputs(
    /*setupFunctionNames=*/ [],
    /*setupArgs=*/ [],
    /*appFunctionNames=*/ [functionName],
    /*appArgs=*/ [calldata],
    /*teardownFunctionName=*/ undefined,
    /*teardownArgs=*/ [],
    /*expectRevert=*/ false,
  );

  const logger = createLogger('bb-prover:avm-proving-test');

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // Then we prove.
  const proofRes = await generateAvmProofV2(bbPath, bbWorkingDirectory, avmCircuitInputs, logger);
  if (proofRes.status === BB_RESULT.FAILURE) {
    logger.error(`Proof generation failed: ${proofRes.reason}`);
  }
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);
  const succeededRes = proofRes as BBSuccess;

  // Then we verify.
  // Placeholder for now.
  const publicInputs = {
    dummy: [] as any[],
  };

  const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
  const verificationRes = await verifyAvmProofV2(
    bbPath,
    bbWorkingDirectory,
    succeededRes.proofPath!,
    publicInputs,
    rawVkPath,
    logger,
  );
  expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
}, 180_000);
