import { type AccountWalletWithSecretKey, type AztecNode, Fr, type PXE } from '@aztec/aztec.js';
import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { OffchainEffectContract, type TestEvent } from '@aztec/noir-test-contracts.js/OffchainEffect';
import { MessageContext } from '@aztec/stdlib/logs';
import { OFFCHAIN_MESSAGE_IDENTIFIER } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('e2e_offchain_effect', () => {
  let contract1: OffchainEffectContract;
  let contract2: OffchainEffectContract;
  let pxe: PXE;
  let aztecNode: AztecNode;

  jest.setTimeout(TIMEOUT);

  let wallets: AccountWalletWithSecretKey[];
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets, pxe, aztecNode } = await setup(1));
    contract1 = await OffchainEffectContract.deploy(wallets[0]).send().deployed();
    contract2 = await OffchainEffectContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  it('should emit offchain effects', async () => {
    const effects = Array(3)
      .fill(null)
      .map((_, i) => ({
        data: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
        // eslint-disable-next-line camelcase
        next_contract: i % 2 === 0 ? contract2.address : contract1.address,
      }));

    const provenTx = await contract1.methods.emit_offchain_effects(effects).prove();

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
    const provenTx = await contract1.methods.emit_offchain_effects([]).prove();
    expect(provenTx.offchainEffects).toEqual([]);
  });

  it('should revert when emitting offchain effects from utility function', async () => {
    await expect(contract1.methods.emitting_offchain_effect_from_utility_reverts().simulate()).rejects.toThrow(
      'Cannot emit offchain effects from a utility function',
    );
  });

  it('should emit event as offchain message and process it', async () => {
    const [a, b, c] = [1n, 2n, 3n];
    const provenTx = await contract1.methods.emit_event_as_offchain_message_for_msg_sender(a, b, c).prove();
    const { txHash, blockNumber } = await provenTx.send().wait();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);
    const offchainEffect = offchainEffects[0];

    // The data contains the cyphertext, an identifier and the recipient
    expect(offchainEffect.data.length).toEqual(PRIVATE_LOG_CIPHERTEXT_LEN + 2);

    const identifier = offchainEffect.data[0];
    expect(identifier).toEqual(OFFCHAIN_MESSAGE_IDENTIFIER);

    const recipientAddressFr = offchainEffect.data[1];
    // Recipient was set to message sender inside the emit_event_as_offchain_message_for_msg_sender function
    const recipient = wallets[0].getAddress();
    expect(recipient.toField()).toEqual(recipientAddressFr);

    const cyphertext = offchainEffect.data.slice(2, PRIVATE_LOG_CIPHERTEXT_LEN);

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;

    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

    // Process the message
    await contract1.methods.process_message(cyphertext, messageContext.toNoirStruct()).simulate();

    // Get the event from PXE
    const events = await pxe.getPrivateEvents<TestEvent>(
      contract1.address,
      OffchainEffectContract.events.TestEvent,
      blockNumber!,
      1,
      [recipient],
    );

    expect(events.length).toBe(1);
    expect(events[0]).toEqual({
      a,
      b,
      c,
    });
  });

  it('should emit note as offchain message and process it', async () => {
    const value = 123n;
    const owner = wallets[0].getAddress();
    const provenTx = await contract1.methods.emit_note_as_offchain_message(value, owner).prove();
    const { txHash } = await provenTx.send().wait();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);
    const offchainEffect = offchainEffects[0];

    // The data contains the cyphertext, an identifier, and the recipient
    expect(offchainEffect.data.length).toEqual(PRIVATE_LOG_CIPHERTEXT_LEN + 2);

    const identifier = offchainEffect.data[0];
    expect(identifier).toEqual(OFFCHAIN_MESSAGE_IDENTIFIER);

    const recipientAddressFr = offchainEffect.data[1];
    // Recipient was set to message sender inside the emit_note_as_offchain_message function
    const recipient = wallets[0].getAddress();
    expect(recipient.toField()).toEqual(recipientAddressFr);

    const cyphertext = offchainEffect.data.slice(2, PRIVATE_LOG_CIPHERTEXT_LEN);

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;

    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

    // Process the message
    await contract1.methods.process_message(cyphertext, messageContext.toNoirStruct()).simulate();

    // Get the note value
    const noteValue = await contract1.methods.get_note_value(owner).simulate();
    expect(noteValue).toBe(value);
  });
});
