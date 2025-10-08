import {
  registerDeployedBananaCoinInWalletAndGetAddress,
  registerDeployedBananaFPCInWalletAndGetAddress,
  registerDeployedSponsoredFPCInWalletAndGetAddress,
} from '@aztec/aztec';
import {
  Fr,
  GrumpkinScalar,
  PrivateFeePaymentMethod,
  createAztecNodeClient,
  createLogger,
  getFeeJuiceBalance,
  waitForNode,
} from '@aztec/aztec.js';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee/testing';
import { timesParallel } from '@aztec/foundation/collection';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';
import { registerInitialSandboxAccountsInWallet } from '@aztec/test-wallet/server';
import { TestWallet } from '@aztec/test-wallet/server';

import { format } from 'util';

import { deployToken, mintTokensToPrivate } from '../fixtures/token_utils.js';

const { AZTEC_NODE_URL = 'http://localhost:8080' } = process.env;

// To run these tests against a local sandbox:
// 1. Start a local Ethereum node (Anvil):
//    anvil --host 127.0.0.1 --port 8545
//
// 2. Start the Aztec sandbox:
//    cd yarn-project/aztec
//    NODE_NO_WARNINGS=1 ETHEREUM_HOSTS=http://127.0.0.1:8545 node ./dest/bin/index.js start --sandbox
//
// 3. Run the tests:
//    yarn test:e2e e2e_sandbox_example.test.ts
describe('e2e_sandbox_example', () => {
  it('sandbox example works', async () => {
    // docs:start:setup
    ////////////// CREATE THE CLIENT INTERFACE AND CONTACT THE SANDBOX //////////////
    const logger = createLogger('e2e:token');

    // We create PXE client connected to the sandbox URL
    const node = createAztecNodeClient(AZTEC_NODE_URL);
    // Wait for sandbox to be ready
    await waitForNode(node, logger);
    const wallet = await TestWallet.create(node);

    const nodeInfo = await node.getNodeInfo();

    logger.info(format('Aztec Sandbox Info ', nodeInfo));

    // docs:end:setup

    expect(typeof nodeInfo.rollupVersion).toBe('number');
    expect(typeof nodeInfo.l1ChainId).toBe('number');
    expect(typeof nodeInfo.l1ContractAddresses.rollupAddress).toBe('object');

    // For the sandbox quickstart we just want to show them preloaded accounts (since it is a quickstart)
    // We show creation of accounts in a later test

    ////////////// LOAD SOME ACCOUNTS FROM THE SANDBOX //////////////
    // The sandbox comes with a set of created accounts. Load them
    const [alice, bob] = await registerInitialSandboxAccountsInWallet(wallet);

    logger.info(`Loaded alice's account at ${alice.toString()}`);
    logger.info(`Loaded bob's account at ${bob.toString()}`);

    ////////////// DEPLOY OUR TOKEN CONTRACT //////////////

    const initialSupply = 1_000_000n;

    const tokenContract = await deployToken(wallet, alice, initialSupply, logger);

    ////////////// QUERYING THE TOKEN BALANCE FOR EACH ACCOUNT //////////////

    let aliceBalance = await tokenContract.methods.balance_of_private(alice).simulate({ from: alice });
    logger.info(`Alice's balance ${aliceBalance}`);

    let bobBalance = await tokenContract.methods.balance_of_private(bob).simulate({ from: bob });
    logger.info(`Bob's balance ${bobBalance}`);

    expect(aliceBalance).toBe(initialSupply);
    expect(bobBalance).toBe(0n);

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

    expect(aliceBalance).toBe(initialSupply - transferQuantity);
    expect(bobBalance).toBe(transferQuantity);

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

    expect(aliceBalance).toBe(initialSupply - transferQuantity);
    expect(bobBalance).toBe(transferQuantity + mintQuantity);
  });

  it('can create accounts on the sandbox', async () => {
    const logger = createLogger('e2e:token');
    // We create PXE client connected to the sandbox URL
    const node = createAztecNodeClient(AZTEC_NODE_URL);
    // Wait for sandbox to be ready
    await waitForNode(node, logger);
    const wallet = await TestWallet.create(node);

    ////////////// CREATE SOME ACCOUNTS WITH SCHNORR SIGNERS //////////////

    // Use one of the pre-funded accounts to pay for the deployments.
    const [fundedAccount] = await registerInitialSandboxAccountsInWallet(wallet);

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
          const deployMethod = await x.getDeployMethod();
          await deployMethod.send({ from: fundedAccount }).wait();
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

    // check that alice and bob are in registeredAccounts
    expect(registeredAccounts.find(acc => acc.equals(alice))).toBeTruthy();
    expect(registeredAccounts.find(acc => acc.equals(bob))).toBeTruthy();

    ////////////// FUND A NEW ACCOUNT WITH BANANA COIN //////////////
    const bananaCoinAddress = await registerDeployedBananaCoinInWalletAndGetAddress(wallet);
    const bananaCoin = await TokenContract.at(bananaCoinAddress, wallet);
    const mintAmount = 10n ** 20n;
    await bananaCoin.methods.mint_to_private(alice, mintAmount).send({ from: fundedAccount }).wait();

    ////////////// USE A NEW ACCOUNT TO SEND A TX AND PAY WITH BANANA COIN //////////////
    const amountTransferToBob = 100n;
    const bananaFPCAddress = await registerDeployedBananaFPCInWalletAndGetAddress(wallet);
    // The private fee paying method assembled on the app side requires knowledge of the maximum
    // fee the user is willing to pay
    const maxFeesPerGas = (await node.getCurrentBaseFees()).mul(1.5);
    const gasSettings = GasSettings.default({ maxFeesPerGas });
    const paymentMethod = new PrivateFeePaymentMethod(bananaFPCAddress, alice, wallet, gasSettings);
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

    const sponsoredFPC = await registerDeployedSponsoredFPCInWalletAndGetAddress(wallet);
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC);
    // The payment method can also be initialized as follows:
    // const sponsoredPaymentMethod = await SponsoredFeePaymentMethod.new(pxe);
    const initialFPCFeeJuice = await getFeeJuiceBalance(sponsoredFPC, node);

    const receiptForBob = await bananaCoin.methods
      .transfer(alice, amountTransferToAlice)
      .send({ from: bob, fee: { paymentMethod: sponsoredPaymentMethod } })
      .wait();
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
