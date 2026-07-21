import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { getPublicEvents } from '@aztec/aztec.js/events';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { CustomMessageContract, type MultiLogEvent } from '@aztec/noir-test-contracts.js/CustomMessage';
import { EventOnlyContract, type TestEvent } from '@aztec/noir-test-contracts.js/EventOnly';
import { type LargeEvent, LargePublicEventContract } from '@aztec/noir-test-contracts.js/LargePublicEvent';

import { jest } from '@jest/globals';

import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// Consolidated event emission/retrieval tests. A single automine node with one funded account deploys the
// EventOnly, CustomMessage, and LargePublicEvent contracts in beforeAll; each per-contract describe below
// exercises one event round-trip via wallet.getPrivateEvents / getPublicEvents.
describe('automine/effects/events', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let aztecNode: AztecNode;
  let account: AztecAddress;
  let teardown: () => Promise<void>;

  let eventOnlyContract: EventOnlyContract;
  let customMessageContract: CustomMessageContract;
  let largePublicEventContract: LargePublicEventContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [account],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);

    ({ contract: eventOnlyContract } = await EventOnlyContract.deploy(wallet).send({ from: account }));
    ({ contract: customMessageContract } = await CustomMessageContract.deploy(wallet).send({ from: account }));
    ({ contract: largePublicEventContract } = await LargePublicEventContract.deploy(wallet).send({ from: account }));
  });

  afterAll(() => teardown());

  // A private event can be obtained for a contract that does not work with notes.
  describe('EventOnly', () => {
    // Sends emit_event_for_msg_sender, then calls getPrivateEvents for TestEvent and asserts that
    // exactly one event is returned with the correct value field.
    it('emits and retrieves a private event for a contract with no notes', async () => {
      const value = Fr.random();
      const { receipt: tx } = await eventOnlyContract.methods.emit_event_for_msg_sender(value).send({ from: account });

      const events = await wallet.getPrivateEvents<TestEvent>(EventOnlyContract.events.TestEvent, {
        contractAddress: eventOnlyContract.address,
        fromBlock: BlockNumber(tx.blockNumber!),
        toBlock: BlockNumber(tx.blockNumber! + 1),
        scopes: [account],
      });

      expect(events.length).toBe(1);
      expect(events[0].event.value).toBe(value.toBigInt());
    });
  });

  // The CustomMessage contract's multi-log event pattern: emitting a single event split across multiple
  // private logs and reassembling it via wallet.getPrivateEvents.
  describe('CustomMessage', () => {
    // Emits one MultiLogEvent via emit_multi_log_event, retrieves it via getPrivateEvents, and
    // asserts all four field values match.
    it('reassembles a multi-log event from multiple private logs', async () => {
      const values = [Fr.random(), Fr.random(), Fr.random(), Fr.random()];

      const { receipt: tx } = await customMessageContract.methods
        .emit_multi_log_event(values[0], values[1], values[2], values[3], account)
        .send({ from: account });

      const events = await wallet.getPrivateEvents<MultiLogEvent>(CustomMessageContract.events.MultiLogEvent, {
        contractAddress: customMessageContract.address,
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
        customMessageContract.methods.emit_multi_log_event(valuesA[0], valuesA[1], valuesA[2], valuesA[3], account),
        customMessageContract.methods.emit_multi_log_event(valuesB[0], valuesB[1], valuesB[2], valuesB[3], account),
      ]).send({ from: account });

      const events = await wallet.getPrivateEvents<MultiLogEvent>(CustomMessageContract.events.MultiLogEvent, {
        contractAddress: customMessageContract.address,
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

  // Events exceeding MAX_EVENT_SERIALIZED_LEN can be emitted publicly and reassembled on retrieval.
  describe('LargePublicEvent', () => {
    // Sends emit_large_event with 11 random Fr fields, retrieves via getPublicEvents, and asserts
    // the returned event's data array matches.
    it('emits and retrieves a public event with more than MAX_EVENT_SERIALIZED_LEN fields', async () => {
      const data = Array.from({ length: 11 }, () => Fr.random());

      const { receipt: tx } = await largePublicEventContract.methods.emit_large_event(data).send({ from: account });

      const { events } = await getPublicEvents<LargeEvent>(aztecNode, LargePublicEventContract.events.LargeEvent, {
        contractAddress: largePublicEventContract.address,
        fromBlock: BlockNumber(tx.blockNumber!),
        toBlock: BlockNumber(tx.blockNumber! + 1),
      });

      expect(events.length).toBe(1);
      expect(events[0].event.data).toEqual(data.map(f => f.toBigInt()));
    });
  });
});
