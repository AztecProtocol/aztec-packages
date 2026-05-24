import type { InitialAccountData } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';

import { expect, jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { deployToken, expectTokenBalance, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup, setupPXEAndGetWallet } from './fixtures/utils.js';
import { TestWallet } from './test-wallet/test_wallet.js';

const TIMEOUT = 300_000;

describe('e2e_2_pxes', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode;
  let walletA: TestWallet;
  let walletB: TestWallet;
  let accountAAddress: AztecAddress;
  let accountBAddress: AztecAddress;
  let initialFundedAccounts: InitialAccountData[];
  let logger: Logger;
  let teardownA: () => Promise<void>;
  let teardownB: () => Promise<void>;

  async function setupSecondaryPXE(
    node: AztecNode,
    fundedAccounts: InitialAccountData[],
    accountIndex: number,
    pxeName: string,
  ) {
    const { wallet, teardown } = await setupPXEAndGetWallet(node, {}, undefined, pxeName);
    const accountManager = await wallet.createSchnorrAccount(
      fundedAccounts[accountIndex].secret,
      fundedAccounts[accountIndex].salt,
    );
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod.send({ from: NO_FROM });
    return { wallet, address: accountManager.address, teardown };
  }

  beforeEach(async () => {
    ({
      aztecNode,
      initialFundedAccounts,
      wallet: walletA,
      accounts: [accountAAddress],
      logger,
      teardown: teardownA,
    } = await setup(1, { ...AUTOMINE_E2E_OPTS, numberOfInitialFundedAccounts: 3 }));

    ({
      wallet: walletB,
      address: accountBAddress,
      teardown: teardownB,
    } = await setupSecondaryPXE(aztecNode, initialFundedAccounts, 1, 'pxe-b'));

    await walletA.registerSender(accountBAddress, 'accountB');
    await walletB.registerSender(accountAAddress, 'accountA');
  });

  afterEach(async () => {
    await teardownB();
    await teardownA();
  });

  it('transfers funds from user A to B via PXE A followed by transfer from B to A via PXE B', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;
    const transferAmount2 = 323n;

    const { contract: token, instance } = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await walletB.registerContract(instance, TokenContract.artifact);

    // Check initial balances are as expected
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance, logger);
    await expectTokenBalance(walletB, token, accountBAddress, 0n, logger);

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(accountBAddress, transferAmount1).send({ from: accountAAddress });

    // Check balances are as expected
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletB, token, accountBAddress, transferAmount1, logger);

    // Transfer funds from B to A via PXE B
    const contractWithWalletB = TokenContract.at(token.address, walletB);
    await contractWithWalletB.methods.transfer(accountAAddress, transferAmount2).send({ from: accountBAddress });

    // Check balances are as expected
    await expectTokenBalance(
      walletA,
      token,
      accountAAddress,
      initialBalance - transferAmount1 + transferAmount2,
      logger,
    );
    await expectTokenBalance(walletB, token, accountBAddress, transferAmount1 - transferAmount2, logger);
  });

  const deployChildContractViaServerA = async () => {
    logger.info(`Deploying Child contract...`);
    const { instance } = await ChildContract.deploy(walletA).send({
      from: accountAAddress,
    });
    logger.info('Child contract deployed');

    return instance;
  };

  const getChildStoredValue = (child: { address: AztecAddress }, node: AztecNode) =>
    node.getPublicStorageAt('latest', child.address, new Fr(1));

  it('user calls a public function on a contract deployed by a different user using a different PXE', async () => {
    const childCompleteAddress = await deployChildContractViaServerA();

    // Add Child to PXE B
    await walletB.registerContract(childCompleteAddress, ChildContract.artifact);

    const newValueToSet = new Fr(256n);

    const childContractWithWalletB = ChildContract.at(childCompleteAddress.address, walletB);
    await childContractWithWalletB.methods.pub_inc_value(newValueToSet).send({ from: accountBAddress });

    const storedValueOnB = await getChildStoredValue(childCompleteAddress, aztecNode!);
    expect(storedValueOnB).toEqual(newValueToSet);

    const storedValueOnA = await getChildStoredValue(childCompleteAddress, aztecNode!);
    expect(storedValueOnA).toEqual(newValueToSet);
  });

  it('private state is "zero" when PXE does not have the account secret key', async () => {
    const userABalance = 100n;
    const userBBalance = 150n;

    const { contract: token, instance } = await deployToken(walletA, accountAAddress, userABalance, logger);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await walletB.registerContract(instance, TokenContract.artifact);

    // Mint tokens to user B
    await mintTokensToPrivate(token, accountAAddress, accountBAddress, userBBalance);

    // Check that user A balance is 100 on server A
    await expectTokenBalance(walletA, token, accountAAddress, userABalance, logger);
    // Check that user B balance is 150 on server B
    await expectTokenBalance(walletB, token, accountBAddress, userBBalance, logger);

    // CHECK THAT PRIVATE BALANCES ARE 0 WHEN ACCOUNT'S SECRET KEYS ARE NOT REGISTERED
    // Check that user A balance is 0 on server B
    await expectTokenBalance(walletB, token, accountAAddress, 0n, logger);
    // Check that user B balance is 0 on server A
    await expectTokenBalance(walletA, token, accountBAddress, 0n, logger);
  });

  it('permits sending funds to a user before they have registered the contract', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;

    const { contract: token, instance } = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Check initial balances are as expected
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance, logger);
    // don't check userB yet

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(accountBAddress, transferAmount1).send({ from: accountAAddress });

    // now add the contract and check balances
    await walletB.registerContract(instance, TokenContract.artifact);
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletB, token, accountBAddress, transferAmount1, logger);
  });

  it('permits sending funds to a user, and spending them, before they have registered the contract', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;
    const transferAmount2 = 323n;

    // setup an account that is shared across PXEs
    const sharedAccount = initialFundedAccounts[2];
    const sharedAccountOnAManager = await walletA.createSchnorrAccount(sharedAccount.secret, sharedAccount.salt);
    const sharedAccountOnADeployMethod = await sharedAccountOnAManager.getDeployMethod();
    await sharedAccountOnADeployMethod.send({ from: NO_FROM });
    const sharedAccountAddress = sharedAccountOnAManager.address;

    // Register the shared account on walletB.
    await walletB.createSchnorrAccount(sharedAccount.secret, sharedAccount.salt);

    // deploy the contract on PXE A
    const { contract: token, instance } = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Transfer funds from A to Shared Wallet via PXE A
    const contractWithWalletA = TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(sharedAccountAddress, transferAmount1).send({ from: accountAAddress });

    // Now send funds from Shared Wallet to B via PXE A
    await contractWithWalletA.methods.transfer(accountBAddress, transferAmount2).send({ from: sharedAccountAddress });

    // check balances from PXE-A's perspective
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletA, token, sharedAccountAddress, transferAmount1 - transferAmount2, logger);

    // now add the contract and check balances from PXE-B's perspective.
    // The process should be:
    // PXE-B had previously deferred the notes from A -> Shared, and Shared -> B
    // PXE-B adds the contract
    // PXE-B reprocesses the deferred notes, and sees the nullifier for A -> Shared
    await walletB.registerContract(instance, TokenContract.artifact);
    await expectTokenBalance(walletB, token, accountBAddress, transferAmount2, logger);
    await expectTokenBalance(walletB, token, sharedAccountAddress, transferAmount1 - transferAmount2, logger);
  });

  it('balance updates automatically after sender is registered', async () => {
    const initialBalance = 500n;
    const transferAmount = 200n;

    const { contract: token, instance } = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Set up a third PXE (C) that does NOT have sender A registered
    const {
      wallet: walletC,
      address: accountCAddress,
      teardown: teardownC,
    } = await setupSecondaryPXE(aztecNode, initialFundedAccounts, 2, 'pxe-c');
    await walletC.registerContract(instance, TokenContract.artifact);

    // Transfer from A to C
    const contractWithWalletA = TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(accountCAddress, transferAmount).send({ from: accountAAddress });

    // Balance is 0 because PXE C doesn't know about sender A yet
    await expectTokenBalance(walletC, token, accountCAddress, 0n, logger);

    // Register sender A on PXE C -- cache invalidation makes balance visible immediately
    await walletC.registerSender(accountAAddress, 'accountA');
    await expectTokenBalance(walletC, token, accountCAddress, transferAmount, logger);

    await teardownC();
  });
});
