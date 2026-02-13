import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getPublicEvents } from '@aztec/aztec.js/events';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { PrivateEventFilter, PublicEventFilter, Wallet } from '@aztec/aztec.js/wallet';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import type { Tuple } from '@aztec/foundation/serialize';
import {
  type ExampleEvent0,
  type ExampleEvent1,
  type ExampleNestedEvent,
  TestLogContract,
} from '@aztec/noir-test-contracts.js/TestLog';

import { jest } from '@jest/globals';

import { ensureAccountContractsPublished, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('Logs', () => {
  let testLogContract: TestLogContract;
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let aztecNode: AztecNode;

  let account1Address: AztecAddress;
  let account2Address: AztecAddress;

  let log: Logger;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [account1Address, account2Address],
      aztecNode,
      logger: log,
    } = await setup(2));

    log.warn(`Setup complete, checking account contracts published`);
    await ensureAccountContractsPublished(wallet, [account1Address, account2Address]);

    log.warn(`Deploying test contract`);
    testLogContract = await TestLogContract.deploy(wallet).send({ from: account1Address });
  });

  afterAll(() => teardown());

  describe('functionality around emitting an encrypted log', () => {
    it('emits multiple events as private logs and decodes them', async () => {
      const preimages = makeTuple(5, makeTuple.bind(undefined, 4, Fr.random)) as Tuple<Tuple<Fr, 4>, 5>;

      const txs = await Promise.all(
        preimages.map(preimage =>
          testLogContract.methods.emit_encrypted_events(account2Address, preimage).send({ from: account1Address }),
        ),
      );

      const firstBlockNumber = Math.min(...txs.map(tx => tx.blockNumber!));
      const lastBlockNumber = Math.max(...txs.map(tx => tx.blockNumber!));

      // docs:start:get_private_events
      const eventFilter: PrivateEventFilter = {
        contractAddress: testLogContract.address,
        fromBlock: BlockNumber(firstBlockNumber),
        toBlock: BlockNumber(lastBlockNumber + 1),
        scopes: [account1Address, account2Address],
      };

      // Each emit_encrypted_events call emits 2 ExampleEvent0s and 1 ExampleEvent1
      // So with 5 calls we expect 10 ExampleEvent0s and 5 ExampleEvent1s
      const collectedEvent0s = await wallet.getPrivateEvents<ExampleEvent0>(
        TestLogContract.events.ExampleEvent0,
        eventFilter,
      );

      const collectedEvent1s = await wallet.getPrivateEvents<ExampleEvent1>(
        TestLogContract.events.ExampleEvent1,
        eventFilter,
      );
      // docs:end:get_private_events

      expect(collectedEvent0s.length).toBe(10); // 2 events per tx * 5 txs
      expect(collectedEvent1s.length).toBe(5); // 1 event per tx * 5 txs

      const emptyEvent1s = await wallet.getPrivateEvents<ExampleEvent1>(
        TestLogContract.events.ExampleEvent1,
        eventFilter,
      );

      expect(emptyEvent1s.length).toBe(5); // Events sent to msg_sender()

      const exampleEvent0Sort = (a: ExampleEvent0, b: ExampleEvent0) => (a.value0 > b.value0 ? 1 : -1);

      // Each preimage is used twice for ExampleEvent0
      const expectedEvent0s: ExampleEvent0[] = [...preimages, ...preimages].map(preimage => ({
        value0: preimage[0].toBigInt(),
        value1: preimage[1].toBigInt(),
      }));
      expect(collectedEvent0s.map(ev => ev.event).sort(exampleEvent0Sort)).toStrictEqual(
        expectedEvent0s.sort(exampleEvent0Sort),
      );

      const exampleEvent1Sort = (a: ExampleEvent1, b: ExampleEvent1) => (a.value2 > b.value2 ? 1 : -1);

      expect(collectedEvent1s.map(ev => ev.event).sort(exampleEvent1Sort)).toStrictEqual(
        preimages
          .map(preimage => ({
            value2: new AztecAddress(preimage[2]),
            // We get the last byte here because value3 is of type u8
            value3: BigInt(preimage[3].toBuffer().subarray(31).readUint8()),
          }))
          .sort(exampleEvent1Sort),
      );
    });

    it('emits multiple unencrypted events as public logs and decodes them', async () => {
      const preimage = makeTuple(5, makeTuple.bind(undefined, 4, Fr.random)) as Tuple<Tuple<Fr, 4>, 5>;

      let i = 0;
      const firstTx = await testLogContract.methods
        .emit_unencrypted_events(preimage[i])
        .send({ from: account1Address });
      await timesParallel(3, () =>
        testLogContract.methods.emit_unencrypted_events(preimage[++i]).send({ from: account1Address }),
      );
      const lastTx = await testLogContract.methods
        .emit_unencrypted_events(preimage[++i])
        .send({ from: account1Address });

      // docs:start:get_public_events
      const publicEventFilter: PublicEventFilter = {
        fromBlock: BlockNumber(firstTx.blockNumber!),
        toBlock: BlockNumber(lastTx.blockNumber! + 1),
      };

      const collectedEvent0s = await getPublicEvents<ExampleEvent0>(
        aztecNode,
        TestLogContract.events.ExampleEvent0,
        publicEventFilter,
      );

      const collectedEvent1s = await getPublicEvents<ExampleEvent1>(
        aztecNode,
        TestLogContract.events.ExampleEvent1,
        publicEventFilter,
      );
      // docs:end:get_public_events

      expect(collectedEvent0s.length).toBe(5);
      expect(collectedEvent1s.length).toBe(5);

      const exampleEvent0Sort = (a: ExampleEvent0, b: ExampleEvent0) => (a.value0 > b.value0 ? 1 : -1);
      expect(collectedEvent0s.map(e => e.event).sort(exampleEvent0Sort)).toStrictEqual(
        preimage
          .map(preimage => ({ value0: preimage[0].toBigInt(), value1: preimage[1].toBigInt() }))
          .sort(exampleEvent0Sort),
      );

      const exampleEvent1Sort = (a: ExampleEvent1, b: ExampleEvent1) => (a.value2 > b.value2 ? 1 : -1);
      expect(collectedEvent1s.map(e => e.event).sort(exampleEvent1Sort)).toStrictEqual(
        preimage
          .map(preimage => ({
            value2: new AztecAddress(preimage[2]),
            // We get the last byte here because value3 is of type u8
            value3: BigInt(preimage[3].toBuffer().subarray(31).readUint8()),
          }))
          .sort(exampleEvent1Sort),
      );
    });

    it('decodes public events with nested structs', async () => {
      const a = Fr.random();
      const b = Fr.random();
      const c = await AztecAddress.random();
      const extra = Fr.random();

      const tx = await testLogContract.methods.emit_nested_event(a, b, c, extra).send({ from: account1Address });

      const collectedEvents = await getPublicEvents<ExampleNestedEvent>(
        aztecNode,
        TestLogContract.events.ExampleNestedEvent,
        {
          fromBlock: BlockNumber(tx.blockNumber!),
          toBlock: BlockNumber(tx.blockNumber! + 1),
        },
      );

      expect(collectedEvents.length).toBe(1);

      const event = collectedEvents[0].event;
      expect(event.nested.a).toEqual(a.toBigInt());
      expect(event.nested.b).toEqual(b.toBigInt());
      expect((event.nested.c as AztecAddress).equals(c)).toBe(true);
      expect(event.extra_value).toEqual(extra.toBigInt());
    });

    // This test verifies that tags remain unique:
    // 1. Across nested calls within the same contract, confirming proper propagation of the ExecutionTaggingIndexCache
    //    between calls,
    // 2. across separate transactions that interact with the same contract function, confirming proper persistence
    //    of the cache contents in the database (TaggingDataProvider) after transaction proving completes.
    it('produces unique tags for encrypted logs across nested calls and different transactions', async () => {
      let tx1Tags: string[];
      // With 4 nestings we have 5 total calls, each emitting 2 logs => 10 logs
      const tx1NumLogs = 10;
      {
        // Call the private function that emits two encrypted logs per call and recursively nests 4 times
        const tx = await testLogContract.methods
          .emit_encrypted_events_nested(account2Address, 4)
          .send({ from: account1Address });

        // Fetch raw private logs for that block and check tag uniqueness
        const logs = (await aztecNode.getBlock(tx.blockNumber!))!.getPrivateLogs().filter(l => !l.isEmpty());

        expect(logs.length).toBe(tx1NumLogs);

        const tags = logs.map(l => l.fields[0].toString());
        expect(new Set(tags).size).toBe(tx1NumLogs);
        tx1Tags = tags;
      }

      let tx2Tags: string[];
      // With 2 nestings we have 3 total calls, each emitting 2 logs => 6 logs
      const tx2NumLogs = 6;
      {
        // Call the private function that emits two encrypted logs per call and recursively nests 2 times
        const tx = await testLogContract.methods
          .emit_encrypted_events_nested(account2Address, 2)
          .send({ from: account1Address });

        const blockNumber = tx.blockNumber!;

        // Fetch raw private logs for that block and check tag uniqueness
        const logs = (await aztecNode.getBlock(blockNumber))!.getPrivateLogs().filter(l => !l.isEmpty());

        expect(logs.length).toBe(tx2NumLogs);

        const tags = logs.map(l => l.fields[0].toString());
        expect(new Set(tags).size).toBe(tx2NumLogs);
        tx2Tags = tags;
      }

      // Now we create a set from both tx1Tags and tx2Tags and expect it to be the same size as the sum of the number
      // of logs in both transactions
      const allTags = new Set([...tx1Tags, ...tx2Tags]);
      expect(allTags.size).toBe(tx1NumLogs + tx2NumLogs);
    });
  });
});
