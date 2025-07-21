import { type AccountWalletWithSecretKey, Fr } from '@aztec/aztec.js';
import { EventOnlyContract, type TestEvent } from '@aztec/noir-test-contracts.js/EventOnly';

import { jest } from '@jest/globals';

import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

/// Tests that a private event can be obtained for a contract that does not work with notes.
describe('EventOnly', () => {
  let eventOnlyContract: EventOnlyContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWalletWithSecretKey[];
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets } = await setup(2));
    await ensureAccountContractsPublished(wallets[0], wallets.slice(0, 2));
    eventOnlyContract = await EventOnlyContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  it('emits and retrieves a private event for a contract with no notes', async () => {
    const value = Fr.random();
    const tx = await eventOnlyContract.methods.emit_event_for_msg_sender(value).send().wait();

    const events = await wallets[0].getPrivateEvents<TestEvent>(
      eventOnlyContract.address,
      EventOnlyContract.events.TestEvent,
      tx.blockNumber!,
      1,
      [wallets[0].getAddress()],
    );

    expect(events.length).toBe(1);
    expect(events[0].value).toBe(value.toBigInt());
  });
});
