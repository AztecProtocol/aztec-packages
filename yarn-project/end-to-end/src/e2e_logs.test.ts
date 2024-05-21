import { createAccounts } from '@aztec/accounts/testing';
import { type AccountWallet, AztecAddress, type AztecNode, Fr, type L2Block, type PXE, LogType, EncryptedL2BlockL2Logs } from '@aztec/aztec.js';
import {
  CompleteAddress,
  GeneratorIndex,
  INITIAL_L2_BLOCK_NUM,
  Point,
  PublicKeys,
  computeAppNullifierSecretKey,
  deriveMasterNullifierSecretKey,
} from '@aztec/circuits.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { KeyRegistryContract, LogTestContract, TestContract } from '@aztec/noir-contracts.js';
import { getCanonicalKeyRegistryAddress } from '@aztec/protocol-contracts/key-registry';

import { jest } from '@jest/globals';

import { publicDeployAccounts, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

const SHARED_MUTABLE_DELAY = 5;

describe('Logs', () => {
  let pxe: PXE;
  let aztecNode: AztecNode;
  let logTestContract: LogTestContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWallet[];

  let teardown: () => Promise<void>;

  const account = CompleteAddress.random();

  beforeAll(async () => {
    ({ aztecNode, teardown, pxe, wallets } = await setup(2));

    await publicDeployAccounts(wallets[0], wallets.slice(0, 2));

    logTestContract = await LogTestContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  describe('emits an encrypted log', () => {
    it('works', async () => {
      const res = await logTestContract.methods.emit_encrypted_log().send().wait();

      const encryptedLogs = await aztecNode.getLogs(res.blockNumber!, 1, LogType.ENCRYPTED);
      const unrolledLogs = EncryptedL2BlockL2Logs.unrollLogs(encryptedLogs);
      console.log('Hello');
      console.log(unrolledLogs.length);
    })
  });
});
