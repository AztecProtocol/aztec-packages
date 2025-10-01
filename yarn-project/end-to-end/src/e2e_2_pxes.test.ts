import type { InitialAccountData } from '@aztec/accounts/testing';
import { AztecAddress, type AztecNode, Fr, type Logger, sleep } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { TestWallet } from '@aztec/test-wallet/server';

import { expect, jest } from '@jest/globals';

import { deployToken, expectTokenBalance, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup, setupPXEAndGetWallet } from './fixtures/utils.js';

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

  beforeEach(async () => {
    ({
      aztecNode,
      initialFundedAccounts,
      wallet: walletA,
      accounts: [accountAAddress],
      logger,
      teardown: teardownA,
    } = await setup(1, { numberOfInitialFundedAccounts: 3 }));

    // Account A is already deployed in setup

    // Deploy accountB via walletB.
    ({ wallet: walletB, teardown: teardownB } = await setupPXEAndGetWallet(aztecNode, {}, undefined, true));
    const accountBManager = await walletB.createSchnorrAccount(
      initialFundedAccounts[1].secret,
      initialFundedAccounts[1].salt,
    );
    accountBAddress = accountBManager.address;
    const accountBDeployMethod = await accountBManager.getDeployMethod();
    await accountBDeployMethod.send({ from: AztecAddress.ZERO }).wait();

    /*TODO(post-honk): We wait 5 seconds for a race condition in setting up two nodes.
     What is a more robust solution? */
    await sleep(5000);

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

    const token = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await walletB.registerContract(token);

    // Check initial balances are as expected
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance, logger);
    await expectTokenBalance(walletB, token, accountBAddress, 0n, logger);

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = await TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(accountBAddress, transferAmount1).send({ from: accountAAddress }).wait();

    // Check balances are as expected
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletB, token, accountBAddress, transferAmount1, logger);

    // Transfer funds from B to A via PXE B
    const contractWithWalletB = await TokenContract.at(token.address, walletB);
    await contractWithWalletB.methods
      .transfer(accountAAddress, transferAmount2)
      .send({ from: accountBAddress })
      .wait({ interval: 0.1 });

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
    const contract = await ChildContract.deploy(walletA).send({ from: accountAAddress }).deployed();
    logger.info('Child contract deployed');

    return contract.instance;
  };

  const getChildStoredValue = (child: { address: AztecAddress }, node: AztecNode) =>
    node.getPublicStorageAt('latest', child.address, new Fr(1));

  it('user calls a public function on a contract deployed by a different user using a different PXE', async () => {
    const childCompleteAddress = await deployChildContractViaServerA();

    // Add Child to PXE B
    await walletB.registerContract({
      artifact: ChildContract.artifact,
      instance: childCompleteAddress,
    });

    const newValueToSet = new Fr(256n);

    const childContractWithWalletB = await ChildContract.at(childCompleteAddress.address, walletB);
    await childContractWithWalletB.methods
      .pub_inc_value(newValueToSet)
      .send({ from: accountBAddress })
      .wait({ interval: 0.1 });

    const storedValueOnB = await getChildStoredValue(childCompleteAddress, aztecNode!);
    expect(storedValueOnB).toEqual(newValueToSet);

    const storedValueOnA = await getChildStoredValue(childCompleteAddress, aztecNode!);
    expect(storedValueOnA).toEqual(newValueToSet);
  });

  it('private state is "zero" when PXE does not have the account secret key', async () => {
    const userABalance = 100n;
    const userBBalance = 150n;

    const token = await deployToken(walletA, accountAAddress, userABalance, logger);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await walletB.registerContract(token);

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

    const token = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Check initial balances are as expected
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance, logger);
    // don't check userB yet

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = await TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(accountBAddress, transferAmount1).send({ from: accountAAddress }).wait();

    // now add the contract and check balances
    await walletB.registerContract(token);
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
    await sharedAccountOnADeployMethod.send({ from: AztecAddress.ZERO }).wait();
    const sharedAccountAddress = sharedAccountOnAManager.address;

    // Register the shared account on walletB.
    await walletB.createSchnorrAccount(sharedAccount.secret, sharedAccount.salt);

    // deploy the contract on PXE A
    const token = await deployToken(walletA, accountAAddress, initialBalance, logger);

    // Transfer funds from A to Shared Wallet via PXE A
    const contractWithWalletA = await TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods
      .transfer(sharedAccountAddress, transferAmount1)
      .send({ from: accountAAddress })
      .wait();

    // Now send funds from Shared Wallet to B via PXE A
    await contractWithWalletA.methods
      .transfer(accountBAddress, transferAmount2)
      .send({ from: sharedAccountAddress })
      .wait();

    // check balances from PXE-A's perspective
    await expectTokenBalance(walletA, token, accountAAddress, initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletA, token, sharedAccountAddress, transferAmount1 - transferAmount2, logger);

    // now add the contract and check balances from PXE-B's perspective.
    // The process should be:
    // PXE-B had previously deferred the notes from A -> Shared, and Shared -> B
    // PXE-B adds the contract
    // PXE-B reprocesses the deferred notes, and sees the nullifier for A -> Shared
    await walletB.registerContract(token);
    await expectTokenBalance(walletB, token, accountBAddress, transferAmount2, logger);
    await expectTokenBalance(walletB, token, sharedAccountAddress, transferAmount1 - transferAmount2, logger);
  });
});
