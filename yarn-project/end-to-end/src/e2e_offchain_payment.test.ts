/* eslint-disable camelcase */
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { extractOffchainOutput } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { retryUntil } from '@aztec/foundation/retry';
import { OffchainPaymentContract } from '@aztec/noir-test-contracts.js/OffchainPayment';
import { TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { getLogger, setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 300_000;

describe('e2e_offchain_payment', () => {
  let contract: OffchainPaymentContract;
  let aztecNode: AztecNode;
  let aztecNodeService: AztecNodeService;
  let wallet: TestWallet;
  let accounts: AztecAddress[];
  let teardown: () => Promise<void>;
  const logger = getLogger();

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    ({ teardown, wallet, accounts, aztecNode, aztecNodeService } = await setup(2, {
      // Finality-sensitive: default to CHECKPOINTED before any setup-phase send.
      defaultWaitStatus: TxStatus.CHECKPOINTED,
      ...AUTOMINE_E2E_OPTS,
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
    await aztecNodeService.mineBlock();
    logger.info(`Empty block mined. New L2 block: ${await aztecNode.getBlockNumber()}`);
  }

  async function forceReorg(checkpointBeforeTx: number) {
    const automine = aztecNodeService.getAutomineSequencer()!;
    await automine.revertToCheckpoint(checkpointBeforeTx);
    logger.info(`Reverted to checkpoint ${checkpointBeforeTx}`);
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

    // Capture the checkpoint tip before the transfer tx so we know where to revert to.
    const checkpointBeforeTx = (await aztecNode.getChainTips()).checkpointed.checkpoint.number;

    const provenTx = await proveInteraction(wallet, contract.methods.transfer_offchain(paymentAmount, bob), {
      from: alice,
    });

    const receipt = await provenTx.send();
    expect(receipt.blockNumber).toBeDefined();

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

    await forceReorg(checkpointBeforeTx);

    // Verify that the payment TX is no longer present after the reorg
    const txEffectAfterRollback = await aztecNode.getTxEffect(txHash);
    expect(txEffectAfterRollback).toBeFalsy();

    // Verify that Bob's balance has rolled back to 0 (pre-payment value) after the reorg
    const { result: bobAfterRollback } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobAfterRollback).toBe(0n);

    // Verify Alice's balance also rolled back to full mint amount (transfer was reverted)
    const { result: aliceAfterRollback } = await contract.methods.get_balance(alice).simulate({ from: alice });
    expect(aliceAfterRollback).toBe(mintAmount);

    // The p2p tx pool marks rolled-back txs as pending again, so the AutomineSequencer
    // re-mines the transfer tx automatically. Force a block build so the PXE re-syncs
    // and reprocesses the offchain-delivered notes.
    await forceEmptyBlock();

    // Wait for the PXE to process the re-mined block and update its note view.
    // The PXE syncs asynchronously from the archiver, so the balance may lag briefly.
    await retryUntil(
      async () => {
        const { result } = await contract.methods.get_balance(bob).simulate({ from: bob });
        return result === paymentAmount;
      },
      'Bob balance restored after re-mine',
      30,
      0.1,
    );

    // Check that the message was reprocessed and Bob has his payment again.
    // Notice what we want to test here is that the offchain effects don't need to be re-enqueued
    // for the system to re-process it.
    const { result: bobBalanceAfterResentTx } = await contract.methods.get_balance(bob).simulate({ from: bob });
    expect(bobBalanceAfterResentTx).toBe(paymentAmount);

    const { result: aliceBalanceAfterResentTx } = await contract.methods.get_balance(alice).simulate({ from: alice });
    expect(aliceBalanceAfterResentTx).toBe(mintAmount - paymentAmount);
  });
});
