/**
 * E2E tests for: Process Offchain Messages via Contract
 *
 * Validates the full offchain message flow: contract emits offchain message →
 * sender gets offchain effects → recipient calls contract's process_message
 * utility → events/notes become discoverable.
 *
 * Uses two separate PXE instances (senderWallet and recipientWallet) to
 * validate true cross-wallet message delivery.
 */
import type { InitialAccountData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { OffchainEffectContract, type TestEvent } from '@aztec/noir-test-contracts.js/OffchainEffect';
import { MessageContext } from '@aztec/stdlib/logs';

import { jest } from '@jest/globals';

import { setup, setupPXEAndGetWallet } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 300_000;

/**
 * Extract ciphertext from an offchain effect and call process_message on the contract.
 * The offchain effect data layout is: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient, ...ciphertext].
 */
async function processOffchainEffect(
  contract: OffchainEffectContract,
  offchainEffect: { data: Fr[] },
  txHash: any,
  recipient: AztecAddress,
  aztecNode: AztecNode,
) {
  const ciphertext = offchainEffect.data.slice(2, PRIVATE_LOG_CIPHERTEXT_LEN);
  const txEffect = (await aztecNode.getTxEffect(txHash))!.data;
  const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

  await contract.methods.process_message(ciphertext, messageContext.toNoirStruct()).simulate({ from: recipient });
}

describe('Process Offchain Messages', () => {
  let senderContract: OffchainEffectContract;
  let recipientContract: OffchainEffectContract;
  let aztecNode: AztecNode;
  let senderWallet: TestWallet;
  let recipientWallet: TestWallet;
  let sender: AztecAddress;
  let recipient: AztecAddress;
  let initialFundedAccounts: InitialAccountData[];
  let teardownSender: () => Promise<void>;
  let teardownRecipient: () => Promise<void>;

  jest.setTimeout(TIMEOUT);

  beforeAll(async () => {
    // Sender wallet with first PXE
    ({
      teardown: teardownSender,
      wallet: senderWallet,
      accounts: [sender],
      aztecNode,
      initialFundedAccounts,
    } = await setup(1, { numberOfInitialFundedAccounts: 2 }));

    // Recipient wallet with second PXE
    ({ wallet: recipientWallet, teardown: teardownRecipient } = await setupPXEAndGetWallet(
      aztecNode,
      {},
      undefined,
      'pxe-recipient',
    ));
    const recipientAccountManager = await recipientWallet.createSchnorrAccount(
      initialFundedAccounts[1].secret,
      initialFundedAccounts[1].salt,
    );
    recipient = recipientAccountManager.address;
    await (await recipientAccountManager.getDeployMethod()).send({ from: AztecAddress.ZERO });

    // Register accounts across PXEs
    await senderWallet.registerSender(recipient, 'recipient');
    await recipientWallet.registerSender(sender, 'sender');

    // Deploy contract via sender
    const {
      receipt: { contract, instance },
    } = await OffchainEffectContract.deploy(senderWallet).send({ from: sender, wait: { returnReceipt: true } });
    senderContract = contract;

    // Register the contract on the recipient's PXE and create a contract instance bound to it
    await recipientWallet.registerContract(instance, OffchainEffectContract.artifact);
    recipientContract = OffchainEffectContract.at(contract.address, recipientWallet);
  });

  afterAll(async () => {
    await teardownRecipient();
    await teardownSender();
  });

  it('self-addressed event processed from offchain effect', async () => {
    const [a, b, c] = [100n, 200n, 300n];
    const provenTx = await proveInteraction(
      senderWallet,
      senderContract.methods.emit_event_as_offchain_message_for_msg_sender(a, b, c),
      { from: sender },
    );
    const { txHash, blockNumber, blockHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);

    await processOffchainEffect(senderContract, offchainEffects[0], txHash, sender, aztecNode);

    const events = await senderWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: senderContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [sender],
    });

    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      event: { a, b, c },
      metadata: { l2BlockNumber: blockNumber, l2BlockHash: blockHash, txHash },
    });
  });

  it('self-addressed note processed from offchain effect', async () => {
    const value = 789n;
    const provenTx = await proveInteraction(
      senderWallet,
      senderContract.methods.emit_note_as_offchain_message(value, sender),
      { from: sender },
    );
    const { txHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);

    await processOffchainEffect(senderContract, offchainEffects[0], txHash, sender, aztecNode);

    const { result: noteValue } = await senderContract.methods.get_note_value(sender).simulate({ from: sender });
    expect(noteValue).toBe(value);
  });

  it('multiple offchain effects processed from one transaction', async () => {
    const [a1, b1, c1] = [10n, 20n, 30n];
    const [a2, b2, c2] = [40n, 50n, 60n];
    const provenTx = await proveInteraction(
      senderWallet,
      senderContract.methods.emit_two_events_as_offchain_messages(a1, b1, c1, a2, b2, c2),
      { from: sender },
    );
    const { txHash, blockNumber } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(2);

    for (const effect of offchainEffects) {
      await processOffchainEffect(senderContract, effect, txHash, sender, aztecNode);
    }

    const events = await senderWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: senderContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [sender],
    });

    expect(events.length).toBe(2);
    const eventValues = events.map(e => e.event);
    expect(eventValues).toContainEqual({ a: a1, b: b1, c: c1 });
    expect(eventValues).toContainEqual({ a: a2, b: b2, c: c2 });
  });

  it('mixed event and note processed from offchain effects', async () => {
    // Deploy a fresh contract to avoid note collisions with earlier tests
    const { contract: freshContract } = await OffchainEffectContract.deploy(senderWallet).send({ from: sender });

    const [a, b, c] = [111n, 222n, 333n];
    const noteValue = 999n;
    const provenTx = await proveInteraction(
      senderWallet,
      freshContract.methods.emit_event_and_note_as_offchain_messages(a, b, c, noteValue, sender),
      { from: sender },
    );
    const { txHash, blockNumber } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(2);

    for (const effect of offchainEffects) {
      await processOffchainEffect(freshContract, effect, txHash, sender, aztecNode);
    }

    const events = await senderWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: freshContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [sender],
    });

    expect(events.length).toBe(1);
    expect(events[0].event).toEqual({ a, b, c });

    const { result: retrievedNoteValue } = await freshContract.methods
      .get_note_value(sender)
      .simulate({ from: sender });
    expect(retrievedNoteValue).toBe(noteValue);
  });

  it('two-party offchain message delivery', async () => {
    const [a, b, c] = [1000n, 2000n, 3000n];

    // Sender emits an event addressed to the recipient
    const provenTx = await proveInteraction(
      senderWallet,
      senderContract.methods.emit_event_as_offchain_message_for(recipient, a, b, c),
      { from: sender },
    );
    const { txHash, blockNumber } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);

    // Recipient processes the offchain effect on their own PXE
    await processOffchainEffect(recipientContract, offchainEffects[0], txHash, recipient, aztecNode);

    // Event is discoverable in recipient's wallet
    const recipientEvents = await recipientWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: recipientContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [recipient],
    });

    expect(recipientEvents.length).toBe(1);
    expect(recipientEvents[0].event).toEqual({ a, b, c });

    // Event is NOT discoverable in sender's wallet
    const senderEvents = await senderWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: senderContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [sender],
    });

    expect(senderEvents.length).toBe(0);
  });

  it('offchain effects are scoped to the processing wallet', async () => {
    const [a, b, c] = [7000n, 8000n, 9000n];

    // Sender emits for recipient
    const provenTx = await proveInteraction(
      senderWallet,
      senderContract.methods.emit_event_as_offchain_message_for(recipient, a, b, c),
      { from: sender },
    );
    const { txHash, blockNumber } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);

    // Sender attempts to process on their own PXE (decryption should fail)
    try {
      await processOffchainEffect(senderContract, offchainEffects[0], txHash, sender, aztecNode);
    } catch {
      // Expected: decryption fails for non-recipient
    }

    // Recipient processes on their own PXE
    await processOffchainEffect(recipientContract, offchainEffects[0], txHash, recipient, aztecNode);

    // Only recipient discovers the event
    const recipientEvents = await recipientWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: recipientContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [recipient],
    });
    expect(recipientEvents.length).toBe(1);
    expect(recipientEvents[0].event).toEqual({ a, b, c });

    const senderEvents = await senderWallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: senderContract.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [sender],
    });
    expect(senderEvents.length).toBe(0);
  });
});
