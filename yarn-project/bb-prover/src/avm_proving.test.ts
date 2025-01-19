import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  MockedAvmTestContractDataSource,
  simulateAvmTestContractGenerateCircuitInputs,
} from '@aztec/simulator/public/fixtures';

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'path';

import { proveAndVerifyAvmTestContract, proveAndVerifyAvmTestContractSimple } from './avm_proving_test_helpers.js';
import { type BBSuccess, BB_RESULT, generateAvmProofV2, verifyAvmProofV2 } from './bb/execute.js';

const TIMEOUT = 300_000;

describe('AVM WitGen, proof generation and verification tests', () => {
  it(
    'bulk_testing v1',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ false, // full proving & verifying
        'bulk_testing',
        /*args=*/ [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x)),
      );
    },
    TIMEOUT,
  );
});
describe('AVM WitGen, "check circuit" tests', () => {
  it(
    'perform too many storage writes and revert',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'n_storage_writes',
        /*args=*/ [new Fr(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many note hashes and revert',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'n_new_note_hashes',
        /*args=*/ [new Fr(MAX_NOTE_HASHES_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many nullifiers and revert',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'n_new_nullifiers',
        /*args=*/ [new Fr(MAX_NULLIFIERS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many l2tol1 messages and revert',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'n_new_l2_to_l1_msgs',
        /*args=*/ [new Fr(MAX_L2_TO_L1_MSGS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many unencrypted logs and revert',
    async () => {
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'n_new_unencrypted_logs',
        /*args=*/ [new Fr(MAX_UNENCRYPTED_LOGS_PER_TX + 1)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'call the max number of unique contract classes',
    async () => {
      const contractDataSource = new MockedAvmTestContractDataSource();
      // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS contract addresses with unique class IDs
      const args = Array.from(contractDataSource.contractInstances.values())
        .map(instance => instance.address.toField())
        .slice(0, MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS);
      // include the first contract again again at the end to ensure that we can call it even after the limit is reached
      args.push(args[0]);
      // include another contract address that reuses a class ID to ensure that we can call it even after the limit is reached
      args.push(contractDataSource.instanceSameClassAsFirstContract.address.toField());
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'nested_call_to_add_n_times_different_addresses',
        args,
        /*expectRevert=*/ false,
        /*skipContractDeployments=*/ false,
        contractDataSource,
      );
    },
    TIMEOUT,
  );
  it(
    'attempt too many calls to unique contract class ids',
    async () => {
      const contractDataSource = new MockedAvmTestContractDataSource();
      // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+1 contract addresses with unique class IDs
      // should fail because we are trying to call MAX+1 unique class IDs
      const args = Array.from(contractDataSource.contractInstances.values()).map(instance =>
        instance.address.toField(),
      );
      // push an empty one (just padding to match function calldata size of MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+2)
      args.push(new Fr(0));
      await proveAndVerifyAvmTestContractSimple(
        /*checkCircuitOnly=*/ true, // quick
        'nested_call_to_add_n_times_different_addresses',
        args,
        /*expectRevert=*/ true,
        /*skipContractDeployments=*/ false,
        contractDataSource,
      );
    },
    TIMEOUT,
  );
  it(
    'enqueued calls in every phase, with enqueued calls that depend on each other',
    async () => {
      await proveAndVerifyAvmTestContract(
        /*checkCircuitOnly=*/ true,
        /*setupFunctionNames=*/ ['read_assert_storage_single', 'set_storage_single'],
        /*setupArgs=*/ [[new Fr(0)], [new Fr(5)]],
        /*appFunctionNames=*/ ['read_assert_storage_single', 'set_storage_single'],
        /*appArgs=*/ [[new Fr(5)], [new Fr(10)]],
        /*teardownFunctionName=*/ 'read_assert_storage_single',
        /*teardownArgs=*/ [new Fr(10)],
      );
    },
    TIMEOUT,
  );
  it(
    'Should prove and verify a TX that reverts in teardown',
    async () => {
      await proveAndVerifyAvmTestContract(
        /*checkCircuitOnly=*/ true,
        /*setupFunctionNames=*/ [],
        /*setupArgs=*/ [],
        /*appFunctionNames=*/ [],
        /*appArgs=*/ [],
        /*teardownFunctionName=*/ 'read_assert_storage_single',
        /*teardownArgs=*/ [new Fr(10)],
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
});

describe('AVM WitGen, proof generation and verification', () => {
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
});
