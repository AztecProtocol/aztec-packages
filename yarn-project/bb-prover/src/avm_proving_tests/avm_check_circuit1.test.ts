import {
  FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_LOG_HEADER_LENGTH,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 30_000;

describe('AVM check-circuit – unhappy paths 1', () => {
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true);
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  it(
    'perform too many storage writes and revert',
    async () => {
      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractInstance.address,
          fnName: 'n_storage_writes',
          args: [new Fr(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX + 1)],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many note hashes and revert',
    async () => {
      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractInstance.address,
          fnName: 'n_new_note_hashes',
          args: [new Fr(MAX_NOTE_HASHES_PER_TX + 1)],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many nullifiers and revert',
    async () => {
      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractInstance.address,
          fnName: 'n_new_nullifiers',
          args: [new Fr(MAX_NULLIFIERS_PER_TX + 1)],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many l2tol1 messages and revert',
    async () => {
      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractInstance.address,
          fnName: 'n_new_l2_to_l1_msgs',
          args: [new Fr(MAX_L2_TO_L1_MSGS_PER_TX + 1)],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
  it(
    'create too many public logs and revert',
    async () => {
      await tester.simProveVerifyAppLogic(
        {
          address: avmTestContractInstance.address,
          fnName: 'n_new_public_logs',
          args: [new Fr(Math.floor(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH / (1 + PUBLIC_LOG_HEADER_LENGTH)) + 1)],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
});
