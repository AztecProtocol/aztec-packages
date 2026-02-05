import type { InitialAccountData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { StateVarsContract } from '@aztec/noir-test-contracts.js/StateVars';
import { TestWallet } from '@aztec/test-wallet/server';

import { expect, jest } from '@jest/globals';

import { setup, setupPXEAndGetWallet } from './fixtures/utils.js';

const TIMEOUT = 300_000;

describe('e2e_foreign_notes', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode;
  let aliceWallet: TestWallet;
  let bobWallet: TestWallet;
  let charlieWallet: TestWallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let charlieAddress: AztecAddress;
  let initialFundedAccounts: InitialAccountData[];
  let logger: Logger;
  let teardownAlice: () => Promise<void>;
  let teardownBob: () => Promise<void>;
  let teardownCharlie: () => Promise<void>;
  let contract: StateVarsContract;

  const VALUE = 42n;

  beforeAll(async () => {
    ({
      aztecNode,
      initialFundedAccounts,
      wallet: aliceWallet,
      accounts: [aliceAddress],
      logger,
      teardown: teardownAlice,
    } = await setup(1, { numberOfInitialFundedAccounts: 4 }));

    ({ wallet: bobWallet, teardown: teardownBob } = await setupPXEAndGetWallet(aztecNode, {}, undefined, 'pxe-bob'));
    const bobAccountManager = await bobWallet.createSchnorrAccount(
      initialFundedAccounts[1].secret,
      initialFundedAccounts[1].salt,
    );
    bobAddress = bobAccountManager.address;
    await (await bobAccountManager.getDeployMethod()).send({ from: AztecAddress.ZERO });

    ({ wallet: charlieWallet, teardown: teardownCharlie } = await setupPXEAndGetWallet(
      aztecNode,
      {},
      undefined,
      'pxe-charlie',
    ));
    const charlieAccountManager = await charlieWallet.createSchnorrAccount(
      initialFundedAccounts[2].secret,
      initialFundedAccounts[2].salt,
    );
    charlieAddress = charlieAccountManager.address;
    await (await charlieAccountManager.getDeployMethod()).send({ from: AztecAddress.ZERO });

    await aliceWallet.registerSender(bobAddress, 'bob');
    await aliceWallet.registerSender(charlieAddress, 'charlie');
    await bobWallet.registerSender(aliceAddress, 'alice');
    await charlieWallet.registerSender(aliceAddress, 'alice');

    logger.info('Deploying StateVars contract...');
    const deployed = await StateVarsContract.deploy(aliceWallet).send({
      from: aliceAddress,
      wait: { returnReceipt: true },
    });
    contract = deployed.contract;
    logger.info(`StateVars contract deployed at ${contract.address}`);

    await bobWallet.registerContract(deployed.instance, StateVarsContract.artifact);
    await charlieWallet.registerContract(deployed.instance, StateVarsContract.artifact);

    logger.info('Alice initializing PrivateImmutable...');
    // Test the share_with function (currently identical to the working one)
    await contract.methods.initialize_private_immutable_and_share_with(VALUE, bobAddress).send({ from: aliceAddress });
    logger.info('PrivateImmutable initialized');
  });

  afterAll(async () => {
    await teardownCharlie();
    await teardownBob();
    await teardownAlice();
  });

  describe('PrivateImmutable external notes', () => {
    it('owner can read their own PrivateImmutable', async () => {
      const contractWithAlice = StateVarsContract.at(contract.address, aliceWallet);
      const result = await contractWithAlice.methods
        .view_private_immutable(aliceAddress)
        .simulate({ from: aliceAddress });

      expect(result.value).toEqual(VALUE);
    });

    it('non-owner can read shared PrivateImmutable', async () => {
      const contractWithBob = StateVarsContract.at(contract.address, bobWallet);
      const result = await contractWithBob.methods.view_private_immutable(aliceAddress).simulate({ from: bobAddress });

      expect(result.value).toEqual(VALUE);
    });

    it('user who never received note cannot read PrivateImmutable', async () => {
      const contractWithCharlie = StateVarsContract.at(contract.address, charlieWallet);
      await expect(
        contractWithCharlie.methods.view_private_immutable(aliceAddress).simulate({ from: charlieAddress }),
      ).rejects.toThrow();
    });
  });
});
