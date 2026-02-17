import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { EventOnlyContract, type TestEvent } from '@aztec/noir-test-contracts.js/EventOnly';

import { jest } from '@jest/globals';

import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

/// Tests that a private event can be obtained for a contract that does not work with notes.
describe('EventOnly', () => {
  let eventOnlyContract: EventOnlyContract;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1));
    await ensureAccountContractsPublished(wallet, [defaultAccountAddress]);
    eventOnlyContract = await EventOnlyContract.deploy(wallet).send({ from: defaultAccountAddress });
  });

  afterAll(() => teardown());

  it('emits and retrieves a private event for a contract with no notes', async () => {
    const value = Fr.random();
    const tx = await eventOnlyContract.methods.emit_event_for_msg_sender(value).send({ from: defaultAccountAddress });

    const events = await wallet.getPrivateEvents<TestEvent>(EventOnlyContract.events.TestEvent, {
      contractAddress: eventOnlyContract.address,
      fromBlock: BlockNumber(tx.blockNumber!),
      toBlock: BlockNumber(tx.blockNumber! + 1),
      scopes: [defaultAccountAddress],
    });

    expect(events.length).toBe(1);
    expect(events[0].event.value).toBe(value.toBigInt());
  });
});
