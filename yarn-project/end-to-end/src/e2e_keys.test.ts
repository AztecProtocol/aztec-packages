import {
  type AccountWallet,
  type AztecAddress,
  type Wallet,
} from '@aztec/aztec.js';

import {
  KeyRegistryContract,
} from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { type BalancesFn, setup } from './fixtures/utils.js';
import { type IGasBridgingTestHarness } from './shared/gas_portal_test_harness.js';

jest.setTimeout(1_000_000_000);

describe('e2e_fees', () => {
  let wallets: AccountWallet[];
  let keyRegistry: KeyRegistryContract;
  let deployL1ContractsValues;
  let logger;
  let pxe;

  beforeAll(async () => {
    const { wallets: _wallets, aztecNode, deployL1ContractsValues, logger, pxe } = await setup(3);
    wallets = _wallets;

    // await aztecNode.setConfig({
    //   feeRecipient: wallets.at(-1)!.getAddress(),
    // });

    keyRegistry = await KeyRegistryContract.deploy(wallets[0])
      .send()
      .deployed();
  });


});
