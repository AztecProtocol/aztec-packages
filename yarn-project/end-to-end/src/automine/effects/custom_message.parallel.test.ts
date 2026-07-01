import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { CustomMessageContract, type MultiLogEvent } from '@aztec/noir-test-contracts.js/CustomMessage';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// Tests the CustomMessage contract's multi-log event pattern: emitting a single event split across
// multiple private logs and reassembling it via wallet.getPrivateEvents.
// Uses setup(1, AUTOMINE_E2E_OPTS) with one node, automine sequencer, one account.
describe('automine/effects/custom_message', () => {
  let contract: CustomMessageContract;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let account: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [account],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
    ({ contract } = await CustomMessageContract.deploy(wallet).send({ from: account }));
  });

  afterAll(() => teardown());

  // Emits one MultiLogEvent via emit_multi_log_event, retrieves it via getPrivateEvents, and
  // asserts all four field values match.
  it('reassembles a multi-log event from multiple private logs', async () => {
    const values = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];

    const { receipt: tx } = await contract.methods
      .emit_multi_log_event(values[0], values[1], values[2], values[3], account)
      .send({ from: account });

    const events = await wallet.getPrivateEvents<MultiLogEvent>(CustomMessageContract.events.MultiLogEvent, {
      contractAddress: contract.address,
      fromBlock: BlockNumber(tx.blockNumber!),
      toBlock: BlockNumber(tx.blockNumber! + 1),
      scopes: [account],
    });

    expect(events.length).toBe(1);
    expect(events[0].event.value0).toBe(values[0].toBigInt());
    expect(events[0].event.value1).toBe(values[1].toBigInt());
    expect(events[0].event.value2).toBe(values[2].toBigInt());
    expect(events[0].event.value3).toBe(values[3].toBigInt());
  });

  // Emits two MultiLogEvents in a single BatchCall, retrieves both, and asserts all eight field
  // values match by matching on value0.
  it('reassembles multiple multi-log events from the same transaction', async () => {
    const valuesA = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];
    const valuesB = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];

    const { receipt: tx } = await new BatchCall(wallet, [
      contract.methods.emit_multi_log_event(valuesA[0], valuesA[1], valuesA[2], valuesA[3], account),
      contract.methods.emit_multi_log_event(valuesB[0], valuesB[1], valuesB[2], valuesB[3], account),
    ]).send({ from: account });

    const events = await wallet.getPrivateEvents<MultiLogEvent>(CustomMessageContract.events.MultiLogEvent, {
      contractAddress: contract.address,
      fromBlock: BlockNumber(tx.blockNumber!),
      toBlock: BlockNumber(tx.blockNumber! + 1),
      scopes: [account],
    });

    expect(events.length).toBe(2);

    // Events may arrive in any order, so match by value0
    const eventA = events.find(e => e.event.value0 === valuesA[0].toBigInt())!;
    const eventB = events.find(e => e.event.value0 === valuesB[0].toBigInt())!;

    expect(eventA).toBeDefined();
    expect(eventA.event.value1).toBe(valuesA[1].toBigInt());
    expect(eventA.event.value2).toBe(valuesA[2].toBigInt());
    expect(eventA.event.value3).toBe(valuesA[3].toBigInt());

    expect(eventB).toBeDefined();
    expect(eventB.event.value1).toBe(valuesB[1].toBigInt());
    expect(eventB.event.value2).toBe(valuesB[2].toBigInt());
    expect(eventB.event.value3).toBe(valuesB[3].toBigInt());
  });
});
