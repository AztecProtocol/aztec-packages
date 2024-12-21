import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  VerificationKeyData,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  simulateAvmTestCallingTooManyContractClassesGenerateCircuitInputs,
  simulateAvmTestContractGenerateCircuitInputs,
} from '@aztec/simulator/public/fixtures';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { type BBSuccess, BB_RESULT, generateAvmProof, verifyAvmProof } from './bb/execute.js';
import { extractAvmVkData } from './verification_key/verification_key_data.js';

const TIMEOUT = 180_000;

describe('AVM WitGen, proof generation and verification', () => {
  it(
    'Should prove and verify bulk_testing',
    async () => {
      await proveAndVerifyAvmTestContract(
        'bulk_testing',
        /*calldata=*/ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x)),
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify test that performs too many storage writes and reverts',
    async () => {
      await proveAndVerifyAvmTestContract(
        'n_storage_writes',
        /*calldata=*/ [new Fr(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify test that creates too many note hashes and reverts',
    async () => {
      await proveAndVerifyAvmTestContract(
        'n_new_note_hashes',
        /*calldata=*/ [new Fr(MAX_NOTE_HASHES_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify test that creates too many nullifiers and reverts',
    async () => {
      await proveAndVerifyAvmTestContract(
        'n_new_nullifiers',
        /*calldata=*/ [new Fr(MAX_NULLIFIERS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify test that creates too many l2tol1 messages and reverts',
    async () => {
      await proveAndVerifyAvmTestContract(
        'n_new_l2_to_l1_msgs',
        /*calldata=*/ [new Fr(MAX_L2_TO_L1_MSGS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify test that creates too many unencrypted logs and reverts',
    async () => {
      await proveAndVerifyAvmTestContract(
        'n_new_unencrypted_logs',
        /*calldata=*/ [new Fr(MAX_UNENCRYPTED_LOGS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify test that attempts too many calls to unique contract class ids',
    async () => {
      await proveAndVerifyAvmTestCallingTooManyContractClasses();
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify a top-level exceptional halt',
    async () => {
      await proveAndVerifyAvmTestContract('divide_by_zero', /*calldata=*/ [], /*expectRevert=*/ true);
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify a nested exceptional halt that propagates to top-level',
    async () => {
      await proveAndVerifyAvmTestContract('external_call_to_divide_by_zero', /*calldata=*/ [], /*expectRevert=*/ true);
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify a nested exceptional halt that is recovered from in caller',
    async () => {
      await proveAndVerifyAvmTestContract(
        'external_call_to_divide_by_zero_recovers',
        /*calldata=*/ [],
        /*expectRevert=*/ false,
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify an exceptional halt due to a nested call to non-existent contract that is propagated to top-level',
    async () => {
      await proveAndVerifyAvmTestContract('nested_call_to_nothing', /*calldata=*/ [], /*expectRevert=*/ true);
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify an exceptional halt due to a nested call to non-existent contract that is recovered from in caller',
    async () => {
      await proveAndVerifyAvmTestContract('nested_call_to_nothing_recovers', /*calldata=*/ [], /*expectRevert=*/ false);
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify a top-level exceptional halt due to a non-existent contract',
    async () => {
      await proveAndVerifyAvmTestContract(
        'add_args_return',
        /*calldata=*/ [new Fr(1), new Fr(2)],
        /*expectRevert=*/ true,
        /*skipContractDeployments=*/ true,
      );
    },
    TIMEOUT,
  );
});

async function proveAndVerifyAvmTestContract(
  functionName: string,
  calldata: Fr[] = [],
  expectRevert = false,
  skipContractDeployments = false,
) {
  const avmCircuitInputs = await simulateAvmTestContractGenerateCircuitInputs(
    functionName,
    calldata,
    expectRevert,
    skipContractDeployments,
  );

  const internalLogger = createLogger('bb-prover:avm-proving-test');
  const logger = (msg: string, _data?: any) => internalLogger.verbose(msg);

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, internalLogger);
  if (proofRes.status === BB_RESULT.FAILURE) {
    internalLogger.error(`Proof generation failed: ${proofRes.reason}`);
  }
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  // Then we test VK extraction and serialization.
  const succeededRes = proofRes as BBSuccess;
  const vkData = await extractAvmVkData(succeededRes.vkPath!);
  VerificationKeyData.fromBuffer(vkData.toBuffer());

  // Then we verify.
  const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
  const verificationRes = await verifyAvmProof(bbPath, succeededRes.proofPath!, rawVkPath, logger);
  expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
}

async function proveAndVerifyAvmTestCallingTooManyContractClasses() {
  const avmCircuitInputs = await simulateAvmTestCallingTooManyContractClassesGenerateCircuitInputs();

  const internalLogger = createLogger('bb-prover:avm-proving-test');
  const logger = (msg: string, _data?: any) => internalLogger.verbose(msg);

  // The paths for the barretenberg binary and the write path are hardcoded for now.
  const bbPath = path.resolve('../../barretenberg/cpp/build/bin/bb');
  const bbWorkingDirectory = await fs.mkdtemp(path.join(tmpdir(), 'bb-'));

  // Then we prove.
  const proofRes = await generateAvmProof(bbPath, bbWorkingDirectory, avmCircuitInputs, internalLogger);
  if (proofRes.status === BB_RESULT.FAILURE) {
    internalLogger.error(`Proof generation failed: ${proofRes.reason}`);
  }
  expect(proofRes.status).toEqual(BB_RESULT.SUCCESS);

  // Then we test VK extraction and serialization.
  const succeededRes = proofRes as BBSuccess;
  const vkData = await extractAvmVkData(succeededRes.vkPath!);
  VerificationKeyData.fromBuffer(vkData.toBuffer());

  // Then we verify.
  const rawVkPath = path.join(succeededRes.vkPath!, 'vk');
  const verificationRes = await verifyAvmProof(bbPath, succeededRes.proofPath!, rawVkPath, logger);
  expect(verificationRes.status).toBe(BB_RESULT.SUCCESS);
}
