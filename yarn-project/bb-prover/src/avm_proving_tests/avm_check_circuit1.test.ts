import { type ContractClassPublic, type ContractInstanceWithAddress, FunctionSelector } from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  PUBLIC_DISPATCH_SELECTOR,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { getAvmTestContractBytecode } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;
const DISPATCH_FN_NAME = 'public_dispatch';
const DISPATCH_SELECTOR = new FunctionSelector(PUBLIC_DISPATCH_SELECTOR);

describe('AVM WitGen & Circuit – check circuit', () => {
  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    avmTestContractClass = await makeContractClassPublic(
      /*seed=*/ avmTestContractClassSeed,
      /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
    );
    avmTestContractInstance = await makeContractInstanceFromClassId(
      avmTestContractClass.id,
      /*seed=*/ avmTestContractClassSeed,
    );
    tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
    await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
    await tester.addContractInstance(avmTestContractInstance);
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
          args: [new Fr(MAX_PUBLIC_LOGS_PER_TX + 1)],
        },
        /*expectRevert=*/ true,
      );
    },
    TIMEOUT,
  );
});
