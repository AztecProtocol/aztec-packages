import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { OffchainEffectContract, type TestEvent } from '@aztec/noir-test-contracts.js/OffchainEffect';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

const TIMEOUT = 300_000;

describe('e2e_offchain_effect', () => {
  let contract1: OffchainEffectContract;
  let contract2: OffchainEffectContract;

  jest.setTimeout(TIMEOUT);

  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;
  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
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
    const recipient = defaultAccountAddress;

    const { receipt, offchainMessages } = await contract1.methods
      .emit_event_as_offchain_message_for_msg_sender(a, b, c)
      .send({ from: defaultAccountAddress });

    expect(offchainMessages).toHaveLength(1);
    const msg = offchainMessages[0];
    expect(msg.recipient).toEqual(recipient);

    // Deliver the offchain message via offchain_receive
    await contract1.methods
      .offchain_receive([
        {
          ciphertext: msg.payload,
          recipient,
          // eslint-disable-next-line camelcase
          tx_hash: receipt.txHash.hash,
          // eslint-disable-next-line camelcase
          anchor_block_timestamp: msg.anchorBlockTimestamp,
        },
      ])
      .simulate({ from: recipient });

    // Get the event from PXE
    const events = await wallet.getPrivateEvents<TestEvent>(OffchainEffectContract.events.TestEvent, {
      contractAddress: contract1.address,
      fromBlock: BlockNumber(receipt.blockNumber!),
      toBlock: BlockNumber(receipt.blockNumber! + 1),
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
        l2BlockNumber: receipt.blockNumber,
        l2BlockHash: receipt.blockHash,
        txHash: receipt.txHash,
      },
    });
  });

  it('should emit note as offchain message and process it', async () => {
    const value = 123n;
    const owner = defaultAccountAddress;
    const recipient = defaultAccountAddress;

    const { receipt, offchainMessages } = await contract1.methods
      .emit_note_as_offchain_message(value, owner)
      .send({ from: defaultAccountAddress });

    expect(offchainMessages).toHaveLength(1);
    const msg = offchainMessages[0];
    expect(msg.recipient).toEqual(recipient);

    // Deliver the offchain message via offchain_receive
    await contract1.methods
      .offchain_receive([
        {
          ciphertext: msg.payload,
          recipient,
          // eslint-disable-next-line camelcase
          tx_hash: receipt.txHash.hash,
          // eslint-disable-next-line camelcase
          anchor_block_timestamp: msg.anchorBlockTimestamp,
        },
      ])
      .simulate({ from: recipient });

    // Get the note value
    const { result: noteValue } = await contract1.methods
      .get_note_value(owner)
      .simulate({ from: defaultAccountAddress });
    expect(noteValue).toBe(value);
  });
});
