import { type AccountWalletWithSecretKey, AztecAddress, type AztecNode, Fr, type PXE } from '@aztec/aztec.js';
import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { OffchainEffectContract, type TestEvent } from '@aztec/noir-test-contracts.js/OffchainEffect';
import { MessageContext } from '@aztec/stdlib/logs';

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

  it('should emit offchain message', async () => {
    const messages = await Promise.all(
      Array(3)
        .fill(null)
        .map(async (_, i) => ({
          message: [Fr.random(), Fr.random(), Fr.random(), Fr.random(), Fr.random()],
          recipient: await AztecAddress.random(),
          // eslint-disable-next-line camelcase
          next_contract: i % 2 === 0 ? contract2.address : contract1.address,
        })),
    );

    const provenTx = await contract1.methods.emit_offchain_effect_for_recipient(messages).prove();

    // The expected order of offchain messages is the reverse because the messages are popped from the end of the input
    // BoundedVec.
    const expectedOffchainEffects = messages
      .map((message, i) => ({
        message: message.message,
        recipient: message.recipient,
        contractAddress: i % 2 == 0 ? contract1.address : contract2.address,
      }))
      .reverse();

    expect(provenTx.offchainEffects).toEqual(expectedOffchainEffects);
  });

  it('should not emit any offchain messages', async () => {
    const provenTx = await contract1.methods.emit_offchain_effect_for_recipient([]).prove();
    expect(provenTx.offchainEffects).toEqual([]);
  });

  it('should revert when emitting offchain message from utility function', async () => {
    await expect(contract1.methods.emitting_offchain_effect_from_utility_reverts().simulate()).rejects.toThrow(
      'Cannot emit offchain message from a utility function',
    );
  });

  it('should emit event as offchain message and process it', async () => {
    const [a, b, c] = [1n, 2n, 3n];
    const provenTx = await contract1.methods.emit_event_as_offchain_effect_for_msg_sender(a, b, c).prove();
    const { txHash, blockNumber } = await provenTx.send().wait();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);
    const offchainEffect = offchainEffects[0];

    expect(offchainEffect.message.length).toEqual(PRIVATE_LOG_CIPHERTEXT_LEN);

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;
    // Recipient was set to message sender inside the `emit_event_as_offchain_effect_for_msg_sender` function
    const recipient = wallets[0].getAddress();
    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

    // Process the message
    await contract1.methods.process_message(offchainEffect.message, messageContext.toNoirStruct()).simulate();

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
    const provenTx = await contract1.methods.emit_note_as_offchain_effect(value, owner).prove();
    const { txHash } = await provenTx.send().wait();

    const offchainEffects = provenTx.offchainEffects;
    expect(offchainEffects).toHaveLength(1);
    const offchainEffect = offchainEffects[0];

    expect(offchainEffect.message.length).toEqual(PRIVATE_LOG_CIPHERTEXT_LEN);

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;
    // Recipient was set to message sender inside the emit_note_as_offchain_effect function
    const recipient = wallets[0].getAddress();
    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, recipient);

    // Process the message
    await contract1.methods.process_message(offchainEffect.message, messageContext.toNoirStruct()).simulate();

    // Get the note value
    const noteValue = await contract1.methods.get_note_value(owner).simulate();
    expect(noteValue).toBe(value);
  });
});
