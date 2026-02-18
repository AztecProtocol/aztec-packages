import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { poseidon2HashBytes } from '@aztec/foundation/crypto/poseidon';
import { OffchainEffectContract, type TestEvent } from '@aztec/noir-test-contracts.js/OffchainEffect';
import { MessageContext } from '@aztec/stdlib/logs';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_effect', () => {
  let contract1: OffchainEffectContract;
  let contract2: OffchainEffectContract;
  let aztecNode: AztecNode;

  jest.setTimeout(TIMEOUT);

  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
      aztecNode,
    } = await setup(1));
    ({ contract: contract1 } = await OffchainEffectContract.deploy(wallet).send({ from: defaultAccountAddress }));
    ({ contract: contract2 } = await OffchainEffectContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  it('should return offchain effects from send()', async () => {
    const effects = Array(2)
      .fill(null)
      .map(() => ({
        data: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
        // eslint-disable-next-line camelcase
        next_contract: contract1.address,
      }));

    const { receipt, offchainEffects } = await contract1.methods
      .emit_offchain_effects(effects)
      .send({ from: defaultAccountAddress });

    expect(receipt.hasExecutionSucceeded()).toBe(true);
    // Effects are popped from the end of the BoundedVec, so they come out reversed
    expect(offchainEffects).toHaveLength(2);
    expect(offchainEffects[0].contractAddress).toEqual(contract1.address);
    expect(offchainEffects[0].data).toEqual(effects[1].data);
    expect(offchainEffects[1].contractAddress).toEqual(contract1.address);
    expect(offchainEffects[1].data).toEqual(effects[0].data);
  });

  it('should emit offchain effects', async () => {
    const effects = Array(3)
      .fill(null)
      .map((_, i) => ({
        data: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
        // eslint-disable-next-line camelcase
        next_contract: i % 2 === 0 ? contract2.address : contract1.address,
      }));

    const provenTx = await proveInteraction(wallet, contract1.methods.emit_offchain_effects(effects), {
      from: defaultAccountAddress,
    });

    // The expected order of offchain effects is the reverse because the messages are popped from the end of the input
    // BoundedVec.
    const expectedOffchainEffects = effects
      .map((effect, i) => ({
        data: effect.data,
        contractAddress: i % 2 == 0 ? contract1.address : contract2.address,
      }))
      .reverse();

    expect(provenTx.offchainEffects).toEqual(expectedOffchainEffects);
  });

  it('should not emit any offchain effects', async () => {
    const provenTx = await proveInteraction(wallet, contract1.methods.emit_offchain_effects([]), {
      from: defaultAccountAddress,
    });
    expect(provenTx.offchainEffects).toEqual([]);
  });

  it('should emit event as offchain message and process it', async () => {
    const [a, b, c] = [1n, 2n, 3n];
    const provenTx = await proveInteraction(
      wallet,
      contract1.methods.emit_event_as_offchain_message_for_msg_sender(a, b, c),
      { from: defaultAccountAddress },
    );
    const { txHash, blockNumber, blockHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);
    const offchainEffect = offchainEffects[0];

    // The data contains the ciphertext, an identifier and the recipient
    expect(offchainEffect.data.length).toEqual(PRIVATE_LOG_CIPHERTEXT_LEN + 2);

    const identifier = offchainEffect.data[0];
    expect(identifier).toEqual(await poseidon2HashBytes(Buffer.from('aztecnr_offchain_message')));

    const recipientAddressFr = offchainEffect.data[1];
    // Recipient was set to message sender inside the emit_event_as_offchain_message_for_msg_sender function
    const recipient = defaultAccountAddress;
    expect(recipient.toField()).toEqual(recipientAddressFr);

    const ciphertext = offchainEffect.data.slice(2, PRIVATE_LOG_CIPHERTEXT_LEN);

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;

    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

    // Process the message
    await contract1.methods
      .process_message(ciphertext, messageContext.toNoirStruct())
      .simulate({ from: defaultAccountAddress });

    // Get the event from PXE
    const events = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract1.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [recipient],
    });

    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      event: {
        a,
        b,
        c,
      },
      metadata: {
        l2BlockNumber: blockNumber,
        l2BlockHash: blockHash,
        txHash,
      },
    });
  });

  it('should emit note as offchain message and process it', async () => {
    const value = 123n;
    const owner = defaultAccountAddress;
    const provenTx = await proveInteraction(wallet, contract1.methods.emit_note_as_offchain_message(value, owner), {
      from: defaultAccountAddress,
    });
    const { txHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);
    const offchainEffect = offchainEffects[0];

    // The data contains the ciphertext, an identifier, and the recipient
    expect(offchainEffect.data.length).toEqual(PRIVATE_LOG_CIPHERTEXT_LEN + 2);

    const identifier = offchainEffect.data[0];
    expect(identifier).toEqual(await poseidon2HashBytes(Buffer.from('aztecnr_offchain_message')));

    const recipientAddressFr = offchainEffect.data[1];
    // Recipient was set to message sender inside the emit_note_as_offchain_message function
    const recipient = defaultAccountAddress;
    expect(recipient.toField()).toEqual(recipientAddressFr);

    const ciphertext = offchainEffect.data.slice(2, PRIVATE_LOG_CIPHERTEXT_LEN);

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;

    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

    // Process the message
    await contract1.methods
      .process_message(ciphertext, messageContext.toNoirStruct())
      .simulate({ from: defaultAccountAddress });

    // Get the note value
    const { result: noteValue } = await contract1.methods
      .get_note_value(owner)
      .simulate({ from: defaultAccountAddress });
    expect(noteValue).toBe(value);
  });

  it('should process event via ingestOffchainMessages and sync_state', async () => {
    const [a, b, c] = [10n, 20n, 30n];
    const provenTx = await proveInteraction(
      wallet,
      contract1.methods.emit_event_as_offchain_message_for_msg_sender(a, b, c),
      { from: defaultAccountAddress },
    );
    const { txHash, blockNumber, blockHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);

    // Ingest offchain messages into the wallet (simulating offchain delivery)
    await wallet.ingestOffchainMessages(
      offchainEffects.map((offchainEffect, index) => ({ offchainEffect, txHash, appMessageId: `${txHash}:${index}` })),
    );

    // getPrivateEvents triggers sync_state, which processes the ingested messages automatically
    const events = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract1.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [defaultAccountAddress],
    });

    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      event: { a, b, c },
      metadata: {
        l2BlockNumber: blockNumber,
        l2BlockHash: blockHash,
        txHash,
      },
    });
  });

  it('should process note via ingestOffchainMessages and sync_state', async () => {
    const value = 456n;
    const owner = defaultAccountAddress;
    const provenTx = await proveInteraction(wallet, contract2.methods.emit_note_as_offchain_message(value, owner), {
      from: defaultAccountAddress,
    });
    const { txHash } = await provenTx.send();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);

    // Ingest offchain messages into the wallet (simulating app-layer delivery)
    await wallet.ingestOffchainMessages(
      offchainEffects.map((offchainEffect, index) => ({ offchainEffect, txHash, appMessageId: `${txHash}:${index}` })),
    );

    // get_note_value triggers sync_state, which processes the ingested messages automatically.
    // It also verifies the note was correctly discovered and stored.
    const { result: noteValue } = await contract2.methods
      .get_note_value(owner)
      .simulate({ from: defaultAccountAddress });
    expect(noteValue).toBe(value);
  });

  it('should process multiple offchain messages from one transaction', async () => {
    const [a1, b1, c1] = [10n, 20n, 30n];
    const [a2, b2, c2] = [40n, 50n, 60n];
    const provenTx = await proveInteraction(
      wallet,
      contract1.methods.emit_two_events_as_offchain_messages(a1, b1, c1, a2, b2, c2),
      { from: defaultAccountAddress },
    );
    const { txHash, blockNumber } = await provenTx.send();
    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(2);

    await wallet.ingestOffchainMessages(
      offchainEffects.map((offchainEffect, index) => ({
        offchainEffect,
        txHash,
        appMessageId: `${txHash}:${index}`,
      })),
    );

    const events = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract1.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [defaultAccountAddress],
    });

    expect(events.length).toBe(2);
    const eventValues = events.map(e => e.event);
    expect(eventValues).toContainEqual({ a: a1, b: b1, c: c1 });
    expect(eventValues).toContainEqual({ a: a2, b: b2, c: c2 });
  });

  it('should process mixed event and note from one transaction', async () => {
    const [a, b, c] = [111n, 222n, 333n];
    const noteValue = 999n;
    // Use contract1.address as the note owner to avoid collision with existing notes at defaultAccountAddress
    const noteOwner = contract1.address;
    const provenTx = await proveInteraction(
      wallet,
      contract1.methods.emit_event_and_note_as_offchain_messages(a, b, c, noteValue, noteOwner),
      { from: defaultAccountAddress },
    );
    const { txHash, blockNumber, blockHash } = await provenTx.send();
    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(2);

    await wallet.ingestOffchainMessages(
      offchainEffects.map((offchainEffect, index) => ({
        offchainEffect,
        txHash,
        appMessageId: `${txHash}:${index}`,
      })),
    );

    // Verify the event is discoverable
    const events = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract1.address,
      fromBlock: BlockNumber(blockNumber!),
      toBlock: BlockNumber(blockNumber! + 1),
      scopes: [defaultAccountAddress],
    });
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      event: { a, b, c },
      metadata: {
        l2BlockNumber: blockNumber,
        l2BlockHash: blockHash,
        txHash,
      },
    });

    // Verify the note is discoverable
    const { result: retrievedNoteValue } = await contract1.methods
      .get_note_value(noteOwner)
      .simulate({ from: defaultAccountAddress });
    expect(retrievedNoteValue).toBe(noteValue);
  });

  it('should process batch ingestion from twenty transactions', async () => {
    const TX_COUNT = 20;

    // Emit one event per transaction, collecting results
    const sent: { a: bigint; b: bigint; c: bigint; txHash: any; blockNumber: any; offchainEffects: any[] }[] = [];
    for (let i = 0; i < TX_COUNT; i++) {
      const a = BigInt(i * 100 + 1);
      const b = BigInt(i * 100 + 2);
      const c = BigInt(i * 100 + 3);
      const provenTx = await proveInteraction(
        wallet,
        contract1.methods.emit_event_as_offchain_message_for_msg_sender(a, b, c),
        { from: defaultAccountAddress },
      );
      const { txHash, blockNumber } = await provenTx.send();
      sent.push({ a, b, c, txHash, blockNumber, offchainEffects: provenTx.offchainEffects });
    }

    // Ingest all messages in a single batch
    const allMessages = sent.flatMap(({ txHash, offchainEffects }) =>
      offchainEffects.map((offchainEffect, index) => ({
        offchainEffect,
        txHash,
        appMessageId: `${txHash}:${index}`,
      })),
    );
    await wallet.ingestOffchainMessages(allMessages);

    // Each transaction's event should be independently discoverable
    for (const { a, b, c, blockNumber } of sent) {
      const events = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
        contractAddress: contract1.address,
        fromBlock: BlockNumber(blockNumber!),
        toBlock: BlockNumber(blockNumber! + 1),
        scopes: [defaultAccountAddress],
      });
      const match = events.find(e => e.event.a === a && e.event.b === b && e.event.c === c);
      expect(match).toBeDefined();
    }
  });

  it('should scope offchain messages to the emitting contract', async () => {
    const [a1, b1, c1] = [1000n, 2000n, 3000n];
    const [a2, b2, c2] = [4000n, 5000n, 6000n];

    const provenTx1 = await proveInteraction(
      wallet,
      contract1.methods.emit_event_as_offchain_message_for_msg_sender(a1, b1, c1),
      { from: defaultAccountAddress },
    );
    const { txHash: txHash1, blockNumber: blockNumber1 } = await provenTx1.send();

    const provenTx2 = await proveInteraction(
      wallet,
      contract2.methods.emit_event_as_offchain_message_for_msg_sender(a2, b2, c2),
      { from: defaultAccountAddress },
    );
    const { txHash: txHash2, blockNumber: blockNumber2 } = await provenTx2.send();

    // Ingest both messages
    await wallet.ingestOffchainMessages(
      provenTx1.offchainEffects.map((offchainEffect, index) => ({
        offchainEffect,
        txHash: txHash1,
        appMessageId: `${txHash1}:${index}`,
      })),
    );
    await wallet.ingestOffchainMessages(
      provenTx2.offchainEffects.map((offchainEffect, index) => ({
        offchainEffect,
        txHash: txHash2,
        appMessageId: `${txHash2}:${index}`,
      })),
    );

    // Each contract should only see its own event
    const events1 = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract1.address,
      fromBlock: BlockNumber(blockNumber1!),
      toBlock: BlockNumber(blockNumber1! + 1),
      scopes: [defaultAccountAddress],
    });
    expect(events1.length).toBe(1);
    expect(events1[0].event).toEqual({ a: a1, b: b1, c: c1 });

    const events2 = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract2.address,
      fromBlock: BlockNumber(blockNumber2!),
      toBlock: BlockNumber(blockNumber2! + 1),
      scopes: [defaultAccountAddress],
    });
    expect(events2.length).toBe(1);
    expect(events2[0].event).toEqual({ a: a2, b: b2, c: c2 });
  });
});
