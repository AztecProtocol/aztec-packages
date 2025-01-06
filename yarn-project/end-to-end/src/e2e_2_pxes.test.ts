import { getUnsafeSchnorrAccount } from '@aztec/accounts/single_key';
import { createAccounts } from '@aztec/accounts/testing';
import {
  type AztecAddress,
  type AztecNode,
  type DebugLogger,
  type ExtendedNote,
  Fr,
  type PXE,
  type Wallet,
  retryUntil,
  sleep,
} from '@aztec/aztec.js';
import { ChildContract, TestContract, TokenContract } from '@aztec/noir-contracts.js';

import { expect, jest } from '@jest/globals';

import { deployToken, expectTokenBalance, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup, setupPXEService } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('e2e_2_pxes', () => {
  jest.setTimeout(TIMEOUT);

  let aztecNode: AztecNode | undefined;
  let pxeA: PXE;
  let pxeB: PXE;
  let walletA: Wallet;
  let walletB: Wallet;
  let logger: DebugLogger;
  let teardownA: () => Promise<void>;
  let teardownB: () => Promise<void>;

  beforeEach(async () => {
    ({
      aztecNode,
      pxe: pxeA,
      wallets: [walletA],
      logger,
      teardown: teardownA,
    } = await setup(1));

    ({ pxe: pxeB, teardown: teardownB } = await setupPXEService(aztecNode!, {}, undefined, true));

    [walletB] = await createAccounts(pxeB, 1);
    /*TODO(post-honk): We wait 5 seconds for a race condition in setting up two nodes.
     What is a more robust solution? */
    await sleep(5000);

    await walletA.registerContact(walletB.getAddress());
    await walletB.registerContact(walletA.getAddress());
  });

  afterEach(async () => {
    await teardownB();
    await teardownA();
  });

  // TODO #10296
  it.skip('transfers funds from user A to B via PXE A followed by transfer from B to A via PXE B', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;
    const transferAmount2 = 323n;

    const token = await deployToken(walletA, initialBalance, logger);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await pxeB.registerContract(token);

    // Check initial balances are as expected
    await expectTokenBalance(walletA, token, walletA.getAddress(), initialBalance, logger);
    await expectTokenBalance(walletB, token, walletB.getAddress(), 0n, logger);

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = await TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(walletB.getAddress(), transferAmount1).send().wait();

    // Check balances are as expected
    await expectTokenBalance(walletA, token, walletA.getAddress(), initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletB, token, walletB.getAddress(), transferAmount1, logger);

    // Transfer funds from B to A via PXE B
    const contractWithWalletB = await TokenContract.at(token.address, walletB);
    await contractWithWalletB.methods.transfer(walletA.getAddress(), transferAmount2).send().wait({ interval: 0.1 });

    // Check balances are as expected
    await expectTokenBalance(
      walletA,
      token,
      walletA.getAddress(),
      initialBalance - transferAmount1 + transferAmount2,
      logger,
    );
    await expectTokenBalance(walletB, token, walletB.getAddress(), transferAmount1 - transferAmount2, logger);
  });

  const deployChildContractViaServerA = async () => {
    logger.info(`Deploying Child contract...`);
    const contract = await ChildContract.deploy(walletA).send().deployed();
    logger.info('Child contract deployed');

    return contract.instance;
  };

  const awaitServerSynchronized = async (server: PXE) => {
    const isServerSynchronized = async () => {
      return await server.isGlobalStateSynchronized();
    };
    await retryUntil(isServerSynchronized, 'server sync', 10);
  };

  const getChildStoredValue = (child: { address: AztecAddress }, pxe: PXE) =>
    pxe.getPublicStorageAt(child.address, new Fr(1));

  it('user calls a public function on a contract deployed by a different user using a different PXE', async () => {
    const childCompleteAddress = await deployChildContractViaServerA();

    await awaitServerSynchronized(pxeA);

    // Add Child to PXE B
    await pxeB.registerContract({
      artifact: ChildContract.artifact,
      instance: childCompleteAddress,
    });

    const newValueToSet = new Fr(256n);

    const childContractWithWalletB = await ChildContract.at(childCompleteAddress.address, walletB);
    await childContractWithWalletB.methods.pub_inc_value(newValueToSet).send().wait({ interval: 0.1 });

    await awaitServerSynchronized(pxeA);

    const storedValueOnB = await getChildStoredValue(childCompleteAddress, pxeB);
    expect(storedValueOnB).toEqual(newValueToSet);

    const storedValueOnA = await getChildStoredValue(childCompleteAddress, pxeA);
    expect(storedValueOnA).toEqual(newValueToSet);
  });

  it('private state is "zero" when PXE does not have the account secret key', async () => {
    const userABalance = 100n;
    const userBBalance = 150n;

    const token = await deployToken(walletA, userABalance, logger);

    // Add token to PXE B (PXE A already has it because it was deployed through it)
    await pxeB.registerContract(token);

    // Mint tokens to user B
    await mintTokensToPrivate(token, walletA, walletB.getAddress(), userBBalance);

    // Check that user A balance is 100 on server A
    await expectTokenBalance(walletA, token, walletA.getAddress(), userABalance, logger);
    // Check that user B balance is 150 on server B
    await expectTokenBalance(walletB, token, walletB.getAddress(), userBBalance, logger);

    // CHECK THAT PRIVATE BALANCES ARE 0 WHEN ACCOUNT'S SECRET KEYS ARE NOT REGISTERED
    // Check that user A balance is 0 on server B
    await expectTokenBalance(walletB, token, walletA.getAddress(), 0n, logger);
    // Check that user B balance is 0 on server A
    await expectTokenBalance(walletA, token, walletB.getAddress(), 0n, logger);
  });

  it('permits sending funds to a user before they have registered the contract', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;

    const token = await deployToken(walletA, initialBalance, logger);

    // Check initial balances are as expected
    await expectTokenBalance(walletA, token, walletA.getAddress(), initialBalance, logger);
    // don't check userB yet

    // Transfer funds from A to B via PXE A
    const contractWithWalletA = await TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(walletB.getAddress(), transferAmount1).send().wait();

    // now add the contract and check balances
    await pxeB.registerContract(token);
    await expectTokenBalance(walletA, token, walletA.getAddress(), initialBalance - transferAmount1, logger);
    await expectTokenBalance(walletB, token, walletB.getAddress(), transferAmount1, logger);
  });

  it('permits sending funds to a user, and spending them, before they have registered the contract', async () => {
    const initialBalance = 987n;
    const transferAmount1 = 654n;
    const transferAmount2 = 323n;

    // setup an account that is shared across PXEs
    const sharedSecretKey = Fr.random();
    const sharedAccountOnA = getUnsafeSchnorrAccount(pxeA, sharedSecretKey, Fr.random());
    const sharedAccountAddress = sharedAccountOnA.getCompleteAddress();
    const sharedWalletOnA = await sharedAccountOnA.waitSetup();

    await sharedWalletOnA.registerContact(walletA.getAddress());

    const sharedAccountOnB = getUnsafeSchnorrAccount(pxeB, sharedSecretKey, sharedAccountOnA.salt);
    await sharedAccountOnB.register();
    const sharedWalletOnB = await sharedAccountOnB.getWallet();

    await sharedWalletOnB.registerContact(sharedWalletOnA.getAddress());

    // deploy the contract on PXE A
    const token = await deployToken(walletA, initialBalance, logger);

    // Transfer funds from A to Shared Wallet via PXE A
    const contractWithWalletA = await TokenContract.at(token.address, walletA);
    await contractWithWalletA.methods.transfer(sharedAccountAddress.address, transferAmount1).send().wait();

    // Now send funds from Shared Wallet to B via PXE A
    const contractWithSharedWalletA = await TokenContract.at(token.address, sharedWalletOnA);
    await contractWithSharedWalletA.methods.transfer(walletB.getAddress(), transferAmount2).send().wait();

    // check balances from PXE-A's perspective
    await expectTokenBalance(walletA, token, walletA.getAddress(), initialBalance - transferAmount1, logger);
    await expectTokenBalance(
      sharedWalletOnA,
      token,
      sharedAccountAddress.address,
      transferAmount1 - transferAmount2,
      logger,
    );

    // now add the contract and check balances from PXE-B's perspective.
    // The process should be:
    // PXE-B had previously deferred the notes from A -> Shared, and Shared -> B
    // PXE-B adds the contract
    // PXE-B reprocesses the deferred notes, and sees the nullifier for A -> Shared
    await pxeB.registerContract(token);
    await expectTokenBalance(walletB, token, walletB.getAddress(), transferAmount2, logger);
    await expectTokenBalance(
      sharedWalletOnB,
      token,
      sharedAccountAddress.address,
      transferAmount1 - transferAmount2,
      logger,
    );
  });

  it('adds and fetches a nullified note', async () => {
    // 1. Deploys test contract through PXE A
    const testContract = await TestContract.deploy(walletA).send().deployed();

    // 2. Create a note
    const noteStorageSlot = 10;
    const noteValue = 5;
    let note: ExtendedNote;
    {
      const owner = walletA.getAddress();
      const outgoingViewer = owner;

      const receipt = await testContract.methods
        .call_create_note(noteValue, owner, outgoingViewer, noteStorageSlot)
        .send()
        .wait();
      await testContract.methods.sync_notes().simulate();
      const incomingNotes = await walletA.getIncomingNotes({ txHash: receipt.txHash });
      const outgoingNotes = await walletA.getOutgoingNotes({ txHash: receipt.txHash });
      expect(incomingNotes).toHaveLength(1);
      note = incomingNotes[0];

      // Since owner is the same as outgoing viewer the incoming and outgoing notes should be the same
      expect(outgoingNotes).toHaveLength(1);
      expect(outgoingNotes[0]).toEqual(note);
    }

    // 3. Nullify the note
    {
      const receipt = await testContract.methods.call_destroy_note(noteStorageSlot).send().wait({ debug: true });
      // Check that we got 2 nullifiers - 1 for tx hash, 1 for the note
      expect(receipt.debugInfo?.nullifiers).toHaveLength(2);
    }

    // 4. Adds the nullified public key note to PXE B
    {
      // We need to register the contract to be able to compute the note hash by calling compute_note_hash_and_optionally_a_nullifier(...)
      await pxeB.registerContract(testContract);
      await pxeB.addNullifiedNote(note);
    }

    // 5. Try fetching the nullified note
    {
      const testContractWithWalletB = await TestContract.at(testContract.address, walletB);
      const noteValue = await testContractWithWalletB.methods.call_get_notes(noteStorageSlot, true).simulate();
      expect(noteValue).toBe(noteValue);
      // --> We have successfully obtained the nullified note from PXE B verifying that pxe.addNullifiedNote(...) works
    }
  });
});
