import { getDeployedTestAccounts } from '@aztec/accounts/testing';
import {
  getDeployedBananaCoinAddress,
  getDeployedBananaFPCAddress,
  getDeployedSponsoredFPCAddress,
} from '@aztec/aztec';
// docs:start:imports2
import {
  Fr,
  GrumpkinScalar,
  PrivateFeePaymentMethod,
  createAztecNodeClient,
  createLogger,
  createPXEClient,
  getFeeJuiceBalance,
  waitForPXE,
} from '@aztec/aztec.js';
// docs:end:imports2
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee/testing';
import { timesParallel } from '@aztec/foundation/collection';
// docs:start:imports3
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestWallet } from '@aztec/test-wallet';

import { format } from 'util';

// docs:end:imports3
import { deployToken, mintTokensToPrivate } from '../fixtures/token_utils.js';

const { PXE_URL = 'http://localhost:8080', AZTEC_NODE_URL = 'http://localhost:8079' } = process.env;

describe('e2e_sandbox_example', () => {
  it('sandbox example works', async () => {
    // docs:start:setup
    ////////////// CREATE THE CLIENT INTERFACE AND CONTACT THE SANDBOX //////////////
    const logger = createLogger('e2e:token');

    // We create PXE client connected to the sandbox URL
    const pxe = createPXEClient(PXE_URL);
    const node = createAztecNodeClient(AZTEC_NODE_URL);
    // Wait for sandbox to be ready
    await waitForPXE(pxe, logger);

    const nodeInfo = await node.getNodeInfo();

    logger.info(format('Aztec Sandbox Info ', nodeInfo));

    const wallet = new TestWallet(pxe, node);
    // docs:end:setup

    expect(typeof nodeInfo.rollupVersion).toBe('number');
    expect(typeof nodeInfo.l1ChainId).toBe('number');
    expect(typeof nodeInfo.l1ContractAddresses.rollupAddress).toBe('object');

    // For the sandbox quickstart we just want to show them preloaded accounts (since it is a quickstart)
    // We show creation of accounts in a later test

    // docs:start:load_accounts
    ////////////// LOAD SOME ACCOUNTS FROM THE SANDBOX //////////////
    // The sandbox comes with a set of created accounts. Load them
    const [aliceAccount, bobAccount] = await getDeployedTestAccounts(wallet);
    await wallet.createSchnorrAccount(aliceAccount.secret, aliceAccount.salt);
    await wallet.createSchnorrAccount(bobAccount.secret, bobAccount.salt);

    const alice = aliceAccount.address;
    const bob = bobAccount.address;
    logger.info(`Loaded alice's account at ${alice.toString()}`);
    logger.info(`Loaded bob's account at ${bob.toString()}`);
    // docs:end:load_accounts

    // docs:start:Deployment
    ////////////// DEPLOY OUR TOKEN CONTRACT //////////////

    const initialSupply = 1_000_000n;

    const tokenContract = await deployToken(wallet, alice, initialSupply, logger);
    // docs:end:Deployment

    // ensure that token contract is registered in PXE
    expect(await wallet.getContracts()).toEqual(expect.arrayContaining([tokenContract.address]));

    // docs:start:Balance

    ////////////// QUERYING THE TOKEN BALANCE FOR EACH ACCOUNT //////////////

    let aliceBalance = await tokenContract.methods.balance_of_private(alice).simulate({ from: alice });
    logger.info(`Alice's balance ${aliceBalance}`);

    let bobBalance = await tokenContract.methods.balance_of_private(bob).simulate({ from: bob });
    logger.info(`Bob's balance ${bobBalance}`);

    // docs:end:Balance

    expect(aliceBalance).toBe(initialSupply);
    expect(bobBalance).toBe(0n);

    // docs:start:Transfer
    ////////////// TRANSFER FUNDS FROM ALICE TO BOB //////////////

    // We will now transfer tokens from ALice to Bob
    const transferQuantity = 543n;
    logger.info(`Transferring ${transferQuantity} tokens from Alice to Bob...`);
    await tokenContract.methods.transfer(bob, transferQuantity).send({ from: alice }).wait();

    // Check the new balances
    aliceBalance = await tokenContract.methods.balance_of_private(alice).simulate({ from: alice });
    logger.info(`Alice's balance ${aliceBalance}`);

    bobBalance = await tokenContract.methods.balance_of_private(bob).simulate({ from: bob });
    logger.info(`Bob's balance ${bobBalance}`);
    // docs:end:Transfer

    expect(aliceBalance).toBe(initialSupply - transferQuantity);
    expect(bobBalance).toBe(transferQuantity);

    // docs:start:Mint
    ////////////// MINT SOME MORE TOKENS TO BOB'S ACCOUNT //////////////

    // Now mint some further funds for Bob

    // Alice is nice and she adds Bob as a minter
    await tokenContract.methods.set_minter(bob, true).send({ from: alice }).wait();

    const mintQuantity = 10_000n;
    await mintTokensToPrivate(tokenContract, bob, bob, mintQuantity);

    // Check the new balances
    aliceBalance = await tokenContract.methods.balance_of_private(alice).simulate({ from: alice });
    logger.info(`Alice's balance ${aliceBalance}`);

    bobBalance = await tokenContract.methods.balance_of_private(bob).simulate({ from: bob });
    logger.info(`Bob's balance ${bobBalance}`);
    // docs:end:Mint

    expect(aliceBalance).toBe(initialSupply - transferQuantity);
    expect(bobBalance).toBe(transferQuantity + mintQuantity);
  });

  it('can create accounts on the sandbox', async () => {
    const logger = createLogger('e2e:token');
    // We create PXE client connected to the sandbox URL
    const pxe = createPXEClient(PXE_URL);
    const node = createAztecNodeClient(AZTEC_NODE_URL);
    // Wait for sandbox to be ready
    await waitForPXE(pxe, logger);

    // docs:start:create_accounts
    ////////////// CREATE SOME ACCOUNTS WITH SCHNORR SIGNERS //////////////

    // Use one of the pre-funded accounts to pay for the deployments.
    const wallet = new TestWallet(pxe, node);
    const [fundedAccount] = await getDeployedTestAccounts(wallet);
    await wallet.createSchnorrAccount(fundedAccount.secret, fundedAccount.salt);

    // Creates new accounts using an account contract that verifies schnorr signatures
    // Returns once the deployment transactions have settled
    const createSchnorrAccounts = async (numAccounts: number) => {
      const accountManagers = await timesParallel(numAccounts, () =>
        wallet.createSchnorrAccount(
          Fr.random(), // secret key
          Fr.random(), // salt
          GrumpkinScalar.random(), // signing private key
        ),
      );

      return await Promise.all(
        accountManagers.map(async x => {
          await x.deploy({ deployAccount: fundedAccount.address }).wait();
          return x;
        }),
      );
    };

    // Create 2 accounts and wallets to go with each
    logger.info(`Creating accounts using schnorr signers...`);
    const accounts = await createSchnorrAccounts(2);
    const [alice, bob] = (await Promise.all(accounts.map(a => a.getCompleteAddress()))).map(a => a.address);

    ////////////// VERIFY THE ACCOUNTS WERE CREATED SUCCESSFULLY //////////////
    const registeredAccounts = (await wallet.getAccounts()).map(x => x.item);
    for (const [account, name] of [
      [alice, 'Alice'],
      [bob, 'Bob'],
    ] as const) {
      if (registeredAccounts.find(acc => acc.equals(account))) {
        logger.info(`Created ${name}'s account at ${account.toString()}`);
        continue;
      }
      logger.info(`Failed to create account for ${name}!`);
    }
    // docs:end:create_accounts

    // check that alice and bob are in registeredAccounts
    expect(registeredAccounts.find(acc => acc.equals(alice))).toBeTruthy();
    expect(registeredAccounts.find(acc => acc.equals(bob))).toBeTruthy();

    ////////////// FUND A NEW ACCOUNT WITH BANANA COIN //////////////
    const bananaCoinAddress = await getDeployedBananaCoinAddress(wallet);
    const bananaCoin = await TokenContract.at(bananaCoinAddress, wallet);
    const mintAmount = 10n ** 20n;
    await bananaCoin.methods.mint_to_private(alice, mintAmount).send({ from: fundedAccount.address }).wait();

    ////////////// USE A NEW ACCOUNT TO SEND A TX AND PAY WITH BANANA COIN //////////////
    const amountTransferToBob = 100n;
    const bananaFPCAddress = await getDeployedBananaFPCAddress(wallet);
    const paymentMethod = new PrivateFeePaymentMethod(bananaFPCAddress, alice, wallet);
    const receiptForAlice = await bananaCoin.methods
      .transfer(bob, amountTransferToBob)
      .send({ from: alice, fee: { paymentMethod } })
      .wait();
    const transactionFee = receiptForAlice.transactionFee!;
    logger.info(`Transaction fee: ${transactionFee}`);

    // Check the balances
    const aliceBalance = await bananaCoin.methods.balance_of_private(alice).simulate({ from: alice });
    logger.info(`Alice's balance: ${aliceBalance}`);
    expect(aliceBalance).toEqual(mintAmount - transactionFee - amountTransferToBob);

    const bobBalance = await bananaCoin.methods.balance_of_private(bob).simulate({ from: bob });
    logger.info(`Bob's balance: ${bobBalance}`);
    expect(bobBalance).toEqual(amountTransferToBob);

    ////////////// USE A NEW ACCOUNT TO SEND A TX AND PAY VIA SPONSORED FPC //////////////
    const amountTransferToAlice = 48n;

    const sponsoredFPC = await getDeployedSponsoredFPCAddress(wallet);
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC);
    // The payment method can also be initialized as follows:
    // const sponsoredPaymentMethod = await SponsoredFeePaymentMethod.new(pxe);
    const initialFPCFeeJuice = await getFeeJuiceBalance(sponsoredFPC, node);

    // docs:start:transaction_with_payment_method
    const receiptForBob = await bananaCoin.methods
      .transfer(alice, amountTransferToAlice)
      .send({ from: bob, fee: { paymentMethod: sponsoredPaymentMethod } })
      .wait();
    // docs:end:transaction_with_payment_method
    // Check the balances
    const aliceNewBalance = await bananaCoin.methods.balance_of_private(alice).simulate({ from: alice });
    logger.info(`Alice's new balance: ${aliceNewBalance}`);
    expect(aliceNewBalance).toEqual(aliceBalance + amountTransferToAlice);

    const bobNewBalance = await bananaCoin.methods.balance_of_private(bob).simulate({ from: bob });
    logger.info(`Bob's new balance: ${bobNewBalance}`);
    expect(bobNewBalance).toEqual(bobBalance - amountTransferToAlice);

    expect(await getFeeJuiceBalance(sponsoredFPC, node)).toEqual(initialFPCFeeJuice - receiptForBob.transactionFee!);
  });
});
