import { AztecAddress, Fr, type Wallet } from '@aztec/aztec.js';
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
    eventOnlyContract = await EventOnlyContract.deploy(wallet).send({ from: defaultAccountAddress }).deployed();
  });

  afterAll(() => teardown());

  it('emits and retrieves a private event for a contract with no notes', async () => {
    const value = Fr.random();
    const tx = await eventOnlyContract.methods
      .emit_event_for_msg_sender(value)
      .send({ from: defaultAccountAddress })
      .wait();

    const events = await wallet.getPrivateEvents<TestEvent>(
      eventOnlyContract.address,
      EventOnlyContract.events.TestEvent,
      tx.blockNumber!,
      1,
      [defaultAccountAddress],
    );

    expect(events.length).toBe(1);
    expect(events[0].value).toBe(value.toBigInt());
  });
});
