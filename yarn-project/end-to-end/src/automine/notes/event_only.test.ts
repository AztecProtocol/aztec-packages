import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { EventOnlyContract, type TestEvent } from '@aztec/noir-test-contracts.js/EventOnly';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

/// Tests that a private event can be obtained for a contract that does not work with notes.
// Single automine node, one genesis-funded account, EventOnlyContract deployed in beforeAll.
describe('automine/notes/event_only', () => {
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
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
    ({ contract: eventOnlyContract } = await EventOnlyContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  // Sends emit_event_for_msg_sender, then calls getPrivateEvents for TestEvent and asserts that
  // exactly one event is returned with the correct value field.
  it('emits and retrieves a private event for a contract with no notes', async () => {
    const value = Fr.random();
    const { receipt: tx } = await eventOnlyContract.methods
      .emit_event_for_msg_sender(value)
      .send({ from: defaultAccountAddress });

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
