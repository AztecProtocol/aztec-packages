// Split out as otherwise avm_proving.test.ts is longer than 10 minutes.
import { VerificationKeyData } from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  MockedAvmTestContractDataSource,
  simulateAvmTestContractGenerateCircuitInputs,
} from '@aztec/simulator/public/fixtures';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { type BBSuccess, BB_RESULT, generateAvmProof, verifyAvmProof } from '../bb/execute.js';
import { extractAvmVkData } from '../verification_key/verification_key_data.js';

/**
 * Simulate, prove and verify just a single App Logic enqueued call.
 */
export async function proveAndVerifyAvmTestContractSimple(
  checkCircuitOnly: boolean,
  functionName: string,
  args: Fr[] = [],
  expectRevert = false,
  skipContractDeployments = false,
  contractDataSource = new MockedAvmTestContractDataSource(skipContractDeployments),
) {
  await proveAndVerifyAvmTestContract(
    checkCircuitOnly,
    /*setupFunctionNames=*/ [],
    /*setupArgs=*/ [],
    /*appFunctionNames=*/ [functionName],
    /*appArgs=*/ [args],
    /*teardownFunctionName=*/ undefined,
    /*teardownArgs=*/ [],
    expectRevert,
    skipContractDeployments,
    contractDataSource,
  );
}

/**
 * Simulate, prove and verify setup calls, app logic calls and optionally a teardown call in one TX.
 */
export async function proveAndVerifyAvmTestContract(
  checkCircuitOnly: boolean,
  setupFunctionNames: string[],
  setupArgs: Fr[][],
  appFunctionNames: string[],
  appArgs: Fr[][] = [],
  teardownFunctionName?: string,
  teardownArgs: Fr[] = [],
  expectRevert = false,
  skipContractDeployments = false,
  contractDataSource = new MockedAvmTestContractDataSource(skipContractDeployments),
) {
  const avmCircuitInputs = await simulateAvmTestContractGenerateCircuitInputs(
    setupFunctionNames,
    setupArgs,
    appFunctionNames,
    appArgs,
    teardownFunctionName,
    teardownArgs,
    expectRevert,
    contractDataSource,
  );

  const logger = createLogger('bb-prover:avm-proving-test');

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, logger, checkCircuitOnly);
  if (proofRes.status === BB_RESULT.FAILURE) {
    logger.error(`Proof generation failed: ${proofRes.reason}`);
  }
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  // There is no proof to verify if we only check circuit.
  if (!checkCircuitOnly) {
    // Then we test VK extraction and serialization.
    const succeededRes = proofRes as BBSuccess;
    const vkData = await extractAvmVkData(succeededRes.vkPath!);
    VerificationKeyData.fromBuffer(vkData.toBuffer());

    // Then we verify.
    const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
    const verificationRes = await verifyAvmProof(bbPath, succeededRes.proofPath!, rawVkPath, logger);
    expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
  }
}
