/* eslint-disable camelcase */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { extractOffchainOutput } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { CheatCodes } from '@aztec/aztec/testing';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { OffchainPaymentContract } from '@aztec/noir-test-contracts.js/OffchainPayment';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { getLogger, setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_payment', () => {
  let contract: OffchainPaymentContract;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let cheatCodes: CheatCodes;
  let wallet: TestWallet;
  let accounts: AztecAddress[];
  let teardown: () => Promise<void>;
  const logger = getLogger();

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({ teardown, wallet, accounts, aztecNode, aztecNodeAdmin, cheatCodes } = await setup(2, {
      anvilSlotsInAnEpoch: 32,
    }));
  });

  afterAll(() => teardown());

  beforeEach(async () => {
    ({ contract } = await OffchainPaymentContract.deploy(wallet).send({ from: accounts[0] }));
  });

  async function forceEmptyBlock() {
    const blockBefore = await aztecNode.getBlockNumber();
    logger.info(`Forcing empty block. Current L2 block: ${blockBefore}`);
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    await retryUntil(
      async () => {
        const current = await aztecNode.getBlockNumber();
        logger.info(`Waiting for new L2 block. Current: ${current}`);
        return current > blockBefore;
      },
      'new L2 block',
      30,
      1,
    );
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
  }

  async function forceReorg(block: BlockNumber) {
    // Pause sync as soon as the block is checkpointed so finalization doesn't race ahead
    // of the rollback target. Without this, the archiver can finalize past the target block
    // between the retryUntil returning and pauseSync executing.
    await retryUntil(
      async () => {
        const tips = await aztecNode.getL2Tips();
        if (tips.checkpointed.block.number >= block) {
          await aztecNodeAdmin.pauseSync();
          return true;
        }
        return false;
      },
      'checkpointed block',
      30,
      1,
    );

    await cheatCodes.eth.reorg(1);
    // Pass resumeSync=false so the archiver doesn't immediately re-download the same checkpoint
    // (which would re-sync the PXE before callers can inspect the rolled-back state).
    await aztecNodeAdmin.rollbackTo(Number(block) - 1, /* force */ false, /* resumeSync */ false);
    expect(await aztecNode.getBlockNumber()).toBe(Number(block) - 1);
  }

  it('processes an offchain-delivered private payment via QR-style handoff', async () => {
    const [alice, bob] = accounts;

    const mintAmount = 100n;
    const paymentAmount = 40n;

    // Mint to Alice using onchain delivery so she can spend the note.
    await contract.methods.mint(mintAmount, alice).send({ from: alice });

    // Alice sends the private transfer which emits offchain messages.
    const { receipt, offchainMessages } = await contract.methods
      .transfer_offchain(paymentAmount, bob)
      .send({ from: alice });
    expect(offchainMessages.length).toBeGreaterThan(0);

    const messageForBob = offchainMessages.find(msg => msg.recipient.equals(bob));
    expect(messageForBob).toBeTruthy();

    // Deliver Bob's offchain message (the payment note).
    await contract.methods
      .offchain_receive([
        {
          ciphertext: messageForBob!.payload,
          recipient: bob,
          tx_hash: receipt.txHash.hash,
          anchor_block_timestamp: messageForBob!.anchorBlockTimestamp,
        },
      ])
      .simulate({ from: bob });

    // TODO(F-324): until we implement F-324, we need Alice to self-deliver her own change note
    const messageForAlice = offchainMessages.find(msg => msg.recipient.equals(alice));
    expect(messageForAlice).toBeTruthy();

    // Deliver Alice's offchain message (the change note).
    await contract.methods
      .offchain_receive([
        {
          ciphertext: messageForAlice!.payload,
          recipient: alice,
          tx_hash: receipt.txHash.hash,
          anchor_block_timestamp: messageForAlice!.anchorBlockTimestamp,
        },
      ])
      .simulate({ from: alice });

    const { result: bobBalance } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalance).toBe(paymentAmount);

    const { result: aliceBalance } = await contract.methods.get_balance(alice).simulate({ from: alice });
    expect(aliceBalance).toBe(mintAmount - paymentAmount);
  });

  it('reprocesses an offchain-delivered payment after an L1 reorg', async () => {
    const [alice, bob] = accounts;
    const mintAmount = 100n;
    const paymentAmount = 40n;

    await contract.methods.mint(mintAmount, alice).send({ from: alice });

    const provenTx = await proveInteraction(wallet, contract.methods.transfer_offchain(paymentAmount, bob), {
      from: alice,
    });

    const receipt = await provenTx.send();
    expect(receipt.blockNumber).toBeDefined();

    const txBlockNumber = receipt.blockNumber!;
    const txHash = provenTx.getTxHash();

    const txEffectBeforeReorg = await aztecNode.getTxEffect(txHash);
    expect(txEffectBeforeReorg).toBeTruthy();

    const { offchainMessages } = extractOffchainOutput(
      provenTx.offchainEffects,
      provenTx.data.constants.anchorBlockHeader.globalVariables.timestamp,
    );
    const messageForBob = offchainMessages.find(msg => msg.recipient.equals(bob));
    expect(messageForBob).toBeTruthy();

    // Deliver Bob's offchain message (the payment note).
    await contract.methods
      .offchain_receive([
        {
          ciphertext: messageForBob!.payload,
          recipient: bob,
          tx_hash: txHash.hash,
          anchor_block_timestamp: messageForBob!.anchorBlockTimestamp,
        },
      ])
      .simulate({ from: bob });

    // Deliver Alice's offchain message (the change note).
    const messageForAlice = offchainMessages.find(msg => msg.recipient.equals(alice));
    expect(messageForAlice).toBeTruthy();

    await contract.methods
      .offchain_receive([
        {
          ciphertext: messageForAlice!.payload,
          recipient: alice,
          tx_hash: txHash.hash,
          anchor_block_timestamp: messageForAlice!.anchorBlockTimestamp,
        },
      ])
      .simulate({ from: alice });

    // Check that Bob got the payment before a re-org
    const { result: bobBalance } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalance).toBe(paymentAmount);

    const { result: aliceBalance } = await contract.methods.get_balance(alice).simulate({ from: alice });
    expect(aliceBalance).toBe(mintAmount - paymentAmount);

    await forceReorg(txBlockNumber);

    // Verify that the payment TX is no longer present after the reorg
    const txEffectAfterRollback = await aztecNode.getTxEffect(txHash);
    expect(txEffectAfterRollback).toBeFalsy();

    // Verify that Bob's balance has rolled back to 0 (pre-payment value) after the reorg
    const { result: bobAfterRollback } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobAfterRollback).toBe(0n);

    // Verify Alice's balance also rolled back to full mint amount (transfer was reverted)
    const { result: aliceAfterRollback } = await contract.methods.get_balance(alice).simulate({ from: alice });
    expect(aliceAfterRollback).toBe(mintAmount);

    // Resume sync so the archiver can re-download the checkpoints and the sequencer can produce blocks.
    await aztecNodeAdmin.resumeSync();

    // The archiver re-syncs the same checkpoints from L1 after the reorg, so the tx gets re-mined automatically.
    // Force an empty block so the PXE re-syncs and reprocesses the offchain-delivered notes.
    await forceEmptyBlock();

    // Check that the message was reprocessed and Bob has his payment again.
    // Notice what we want to test here is that the offchain effects don't need to be re-enqueued
    // for the system to re-process it.
    const { result: bobBalanceAfterResentTx } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalanceAfterResentTx).toBe(paymentAmount);

    const { result: aliceBalanceAfterResentTx } = await contract.methods.get_balance(alice).simulate({ from: alice });
    expect(aliceBalanceAfterResentTx).toBe(mintAmount - paymentAmount);
  });
});
