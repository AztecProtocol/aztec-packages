/*
end-to-end-1  | FAIL src/composed/e2e_sandbox_example.test.ts
end-to-end-1  |   e2e_sandbox_example
end-to-end-1  |     ✕ sandbox example works (21539 ms)
end-to-end-1  |     ✕ can create accounts on the sandbox (78417 ms)
end-to-end-1  |
end-to-end-1  |   ● e2e_sandbox_example › sandbox example works
end-to-end-1  |
end-to-end-1  |     (JSON-RPC PROPAGATED) (host http://sandbox:8080) (method pxe_simulateTx) (code 500) Block 3 not yet synced
end-to-end-1  |
end-to-end-1  |       55 |       throw new NoRetryError(errorMessage);
end-to-end-1  |       56 |     } else {
end-to-end-1  |     > 57 |       throw new Error(errorMessage);
end-to-end-1  |          |             ^
end-to-end-1  |       58 |     }
end-to-end-1  |       59 |   }
end-to-end-1  |       60 |
end-to-end-1  |
end-to-end-1  |       at defaultFetch (../../foundation/src/json-rpc/client/fetch.ts:57:13)
end-to-end-1  |       at retry (../../foundation/src/retry/index.ts:56:14)
end-to-end-1  |       at ../../foundation/src/json-rpc/client/fetch.ts:73:12
end-to-end-1  |       at request (../../foundation/src/json-rpc/client/safe_json_rpc_client.ts:33:17)
end-to-end-1  |       at DeployMethod.proveInternal (../../aztec.js/src/contract/base_contract_interaction.ts:53:32)
end-to-end-1  |       at ../../aztec.js/src/contract/base_contract_interaction.ts:78:31
end-to-end-1  |       at DeploySentTx.waitForReceipt (../../aztec.js/src/contract/sent_tx.ts:106:20)
end-to-end-1  |       at DeploySentTx.wait (../../aztec.js/src/contract/sent_tx.ts:73:21)
end-to-end-1  |       at DeploySentTx.wait (../../aztec.js/src/contract/deploy_sent_tx.ts:56:21)
end-to-end-1  |       at DeploySentTx.deployed (../../aztec.js/src/contract/deploy_sent_tx.ts:45:21)
end-to-end-1  |       at deployToken (fixtures/token_utils.ts:7:20)
end-to-end-1  |       at Object.<anonymous> (composed/e2e_sandbox_example.test.ts:53:32)
end-to-end-1  |
end-to-end-1  |   ● e2e_sandbox_example › can create accounts on the sandbox
end-to-end-1  |
end-to-end-1  |     Timeout awaiting isMined
end-to-end-1  |
end-to-end-1  |       94 |
end-to-end-1  |       95 |     if (timeout && timer.s() > timeout) {
end-to-end-1  |     > 96 |       throw new Error(name ? `Timeout awaiting ${name}` : 'Timeout');
end-to-end-1  |          |             ^
end-to-end-1  |       97 |     }
end-to-end-1  |       98 |   }
end-to-end-1  |       99 | }
end-to-end-1  |
end-to-end-1  |       at retryUntil (../../foundation/src/retry/index.ts:96:13)
end-to-end-1  |       at DeployAccountSentTx.waitForReceipt (../../aztec.js/src/contract/sent_tx.ts:110:12)
end-to-end-1  |       at DeployAccountSentTx.wait (../../aztec.js/src/contract/sent_tx.ts:73:21)
end-to-end-1  |       at DeployAccountSentTx.wait (../../aztec.js/src/account_manager/deploy_account_sent_tx.ts:37:21)
end-to-end-1  |       at AccountManager.waitSetup (../../aztec.js/src/account_manager/index.ts:184:5)
end-to-end-1  |       at composed/e2e_sandbox_example.test.ts:143:11
end-to-end-1  |           at async Promise.all (index 0)
end-to-end-1  |       at createSchnorrAccounts (composed/e2e_sandbox_example.test.ts:141:14)
end-to-end-1  |       at Object.<anonymous> (composed/e2e_sandbox_example.test.ts:151:22)
*/
// docs:start:imports1
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
// docs:end:imports1
import {
  getDeployedBananaCoinAddress,
  getDeployedBananaFPCAddress,
  getDeployedSponsoredFPCAddress,
} from '@aztec/aztec';
// docs:start:imports2
import {
  Fr,
  GrumpkinScalar,
  type PXE,
  PrivateFeePaymentMethod,
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

import { format } from 'util';

// docs:end:imports3
import { deployToken, mintTokensToPrivate } from '../fixtures/token_utils.js';

const { PXE_URL = 'http://localhost:8080' } = process.env;

describe('e2e_sandbox_example', () => {
  it('sandbox example works', async () => {
    // docs:start:setup
    ////////////// CREATE THE CLIENT INTERFACE AND CONTACT THE SANDBOX //////////////
    const logger = createLogger('e2e:token');

    // We create PXE client connected to the sandbox URL
    const pxe = createPXEClient(PXE_URL);
    // Wait for sandbox to be ready
    await waitForPXE(pxe, logger);

    const nodeInfo = await pxe.getNodeInfo();

    logger.info(format('Aztec Sandbox Info ', nodeInfo));
    // docs:end:setup

    expect(typeof nodeInfo.rollupVersion).toBe('number');
    expect(typeof nodeInfo.l1ChainId).toBe('number');
    expect(typeof nodeInfo.l1ContractAddresses.rollupAddress).toBe('object');

    // For the sandbox quickstart we just want to show them preloaded accounts (since it is a quickstart)
    // We show creation of accounts in a later test

    // docs:start:load_accounts
    ////////////// LOAD SOME ACCOUNTS FROM THE SANDBOX //////////////
    // The sandbox comes with a set of created accounts. Load them
    const accounts = await getDeployedTestAccountsWallets(pxe);
    const aliceWallet = accounts[0];
    const bobWallet = accounts[1];
    const alice = aliceWallet.getAddress();
    const bob = bobWallet.getAddress();
    logger.info(`Loaded alice's account at ${alice.toString()}`);
    logger.info(`Loaded bob's account at ${bob.toString()}`);
    // docs:end:load_accounts

    // docs:start:Deployment
    ////////////// DEPLOY OUR TOKEN CONTRACT //////////////

    const initialSupply = 1_000_000n;

    const tokenContractAlice = await deployToken(aliceWallet, initialSupply, logger);
    // docs:end:Deployment

    // ensure that token contract is registered in PXE
    expect(await pxe.getContracts()).toEqual(expect.arrayContaining([tokenContractAlice.address]));

    // docs:start:Balance

    ////////////// QUERYING THE TOKEN BALANCE FOR EACH ACCOUNT //////////////

    // Bob wants to mint some funds, the contract is already deployed, create an abstraction and link it his wallet
    // Since we already have a token link, we can simply create a new instance of the contract linked to Bob's wallet
    const tokenContractBob = tokenContractAlice.withWallet(bobWallet);

    let aliceBalance = await tokenContractAlice.methods.balance_of_private(alice).simulate();
    logger.info(`Alice's balance ${aliceBalance}`);

    let bobBalance = await tokenContractBob.methods.balance_of_private(bob).simulate();
    logger.info(`Bob's balance ${bobBalance}`);

    // docs:end:Balance

    expect(aliceBalance).toBe(initialSupply);
    expect(bobBalance).toBe(0n);

    // docs:start:Transfer
    ////////////// TRANSFER FUNDS FROM ALICE TO BOB //////////////

    // We will now transfer tokens from ALice to Bob
    const transferQuantity = 543n;
    logger.info(`Transferring ${transferQuantity} tokens from Alice to Bob...`);
    await tokenContractAlice.methods.transfer(bob, transferQuantity).send().wait();

    // Check the new balances
    aliceBalance = await tokenContractAlice.methods.balance_of_private(alice).simulate();
    logger.info(`Alice's balance ${aliceBalance}`);

    bobBalance = await tokenContractBob.methods.balance_of_private(bob).simulate();
    logger.info(`Bob's balance ${bobBalance}`);
    // docs:end:Transfer

    expect(aliceBalance).toBe(initialSupply - transferQuantity);
    expect(bobBalance).toBe(transferQuantity);

    // docs:start:Mint
    ////////////// MINT SOME MORE TOKENS TO BOB'S ACCOUNT //////////////

    // Now mint some further funds for Bob

    // Alice is nice and she adds Bob as a minter
    await tokenContractAlice.methods.set_minter(bob, true).send().wait();

    const mintQuantity = 10_000n;
    await mintTokensToPrivate(tokenContractBob, bobWallet, bob, mintQuantity);

    // Check the new balances
    aliceBalance = await tokenContractAlice.methods.balance_of_private(alice).simulate();
    logger.info(`Alice's balance ${aliceBalance}`);

    bobBalance = await tokenContractBob.methods.balance_of_private(bob).simulate();
    logger.info(`Bob's balance ${bobBalance}`);
    // docs:end:Mint

    expect(aliceBalance).toBe(initialSupply - transferQuantity);
    expect(bobBalance).toBe(transferQuantity + mintQuantity);
  });

  it('can create accounts on the sandbox', async () => {
    const logger = createLogger('e2e:token');
    // We create PXE client connected to the sandbox URL
    const pxe = createPXEClient(PXE_URL);
    // Wait for sandbox to be ready
    await waitForPXE(pxe, logger);

    // docs:start:create_accounts
    ////////////// CREATE SOME ACCOUNTS WITH SCHNORR SIGNERS //////////////

    // Use one of the pre-funded accounts to pay for the deployments.
    const [fundedWallet] = await getDeployedTestAccountsWallets(pxe);

    // Creates new accounts using an account contract that verifies schnorr signatures
    // Returns once the deployment transactions have settled
    const createSchnorrAccounts = async (numAccounts: number, pxe: PXE) => {
      const accountManagers = await timesParallel(numAccounts, () =>
        getSchnorrAccount(
          pxe,
          Fr.random(), // secret key
          GrumpkinScalar.random(), // signing private key
        ),
      );

      return await Promise.all(
        accountManagers.map(async x => {
          await x.deploy({ deployWallet: fundedWallet }).wait();
          return x;
        }),
      );
    };

    // Create 2 accounts and wallets to go with each
    logger.info(`Creating accounts using schnorr signers...`);
    const accounts = await createSchnorrAccounts(2, pxe);
    const [aliceWallet, bobWallet] = await Promise.all(accounts.map(a => a.getWallet()));
    const [alice, bob] = (await Promise.all(accounts.map(a => a.getCompleteAddress()))).map(a => a.address);

    ////////////// VERIFY THE ACCOUNTS WERE CREATED SUCCESSFULLY //////////////
    const registeredAccounts = (await pxe.getRegisteredAccounts()).map(x => x.address);
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
    const bananaCoinAddress = await getDeployedBananaCoinAddress(pxe);
    const bananaCoin = await TokenContract.at(bananaCoinAddress, fundedWallet);
    const mintAmount = 10n ** 20n;
    await bananaCoin.methods.mint_to_private(fundedWallet.getAddress(), alice, mintAmount).send().wait();

    ////////////// USE A NEW ACCOUNT TO SEND A TX AND PAY WITH BANANA COIN //////////////
    const amountTransferToBob = 100n;
    const bananaFPCAddress = await getDeployedBananaFPCAddress(pxe);
    const paymentMethod = new PrivateFeePaymentMethod(bananaFPCAddress, aliceWallet);
    const receiptForAlice = await bananaCoin
      .withWallet(aliceWallet)
      .methods.transfer(bob, amountTransferToBob)
      .send({ fee: { paymentMethod } })
      .wait();
    const transactionFee = receiptForAlice.transactionFee!;
    logger.info(`Transaction fee: ${transactionFee}`);

    // Check the balances
    const aliceBalance = await bananaCoin.methods.balance_of_private(alice).simulate();
    logger.info(`Alice's balance: ${aliceBalance}`);
    expect(aliceBalance).toEqual(mintAmount - transactionFee - amountTransferToBob);

    const bobBalance = await bananaCoin.methods.balance_of_private(bob).simulate();
    logger.info(`Bob's balance: ${bobBalance}`);
    expect(bobBalance).toEqual(amountTransferToBob);

    ////////////// USE A NEW ACCOUNT TO SEND A TX AND PAY VIA SPONSORED FPC //////////////
    const amountTransferToAlice = 48n;

    const sponsoredFPC = await getDeployedSponsoredFPCAddress(pxe);
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC);
    // The payment method can also be initialized as follows:
    // const sponsoredPaymentMethod = await SponsoredFeePaymentMethod.new(pxe);
    const initialFPCFeeJuice = await getFeeJuiceBalance(sponsoredFPC, pxe);

    // docs:start:transaction_with_payment_method
    const receiptForBob = await bananaCoin
      .withWallet(bobWallet)
      .methods.transfer(alice, amountTransferToAlice)
      .send({ fee: { paymentMethod: sponsoredPaymentMethod } })
      .wait();
    // docs:end:transaction_with_payment_method
    // Check the balances
    const aliceNewBalance = await bananaCoin.methods.balance_of_private(alice).simulate();
    logger.info(`Alice's new balance: ${aliceNewBalance}`);
    expect(aliceNewBalance).toEqual(aliceBalance + amountTransferToAlice);

    const bobNewBalance = await bananaCoin.methods.balance_of_private(bob).simulate();
    logger.info(`Bob's new balance: ${bobNewBalance}`);
    expect(bobNewBalance).toEqual(bobBalance - amountTransferToAlice);

    expect(await getFeeJuiceBalance(sponsoredFPC, pxe)).toEqual(initialFPCFeeJuice - receiptForBob.transactionFee!);
  });
});
