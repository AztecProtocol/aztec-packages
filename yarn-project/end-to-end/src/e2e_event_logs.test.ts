import { AztecAddress, type AztecNode, Fr, type Logger, type Wallet, getDecodedPublicEvents } from '@aztec/aztec.js';
import { makeTuple } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import type { Tuple } from '@aztec/foundation/serialize';
import { type ExampleEvent0, type ExampleEvent1, TestLogContract } from '@aztec/noir-test-contracts.js/TestLog';

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
    testLogContract = await TestLogContract.deploy(wallet).send({ from: account1Address }).deployed();
  });

  afterAll(() => teardown());

  describe('functionality around emitting an encrypted log', () => {
    it('emits multiple events as private logs and decodes them', async () => {
      const preimages = makeTuple(5, makeTuple.bind(undefined, 4, Fr.random)) as Tuple<Tuple<Fr, 4>, 5>;

      const txs = await Promise.all(
        preimages.map(preimage =>
          testLogContract.methods
            .emit_encrypted_events(account2Address, preimage)
            .send({ from: account1Address })
            .wait(),
        ),
      );

      const firstBlockNumber = Math.min(...txs.map(tx => tx.blockNumber!));
      const lastBlockNumber = Math.max(...txs.map(tx => tx.blockNumber!));
      const numBlocks = lastBlockNumber - firstBlockNumber + 1;

      // Each emit_encrypted_events call emits 2 ExampleEvent0s and 1 ExampleEvent1
      // So with 5 calls we expect 10 ExampleEvent0s and 5 ExampleEvent1s
      const collectedEvent0s = await wallet.getPrivateEvents<ExampleEvent0>(
        testLogContract.address,
        TestLogContract.events.ExampleEvent0,
        firstBlockNumber,
        numBlocks,
        [account1Address, account2Address],
      );

      const collectedEvent1s = await wallet.getPrivateEvents<ExampleEvent1>(
        testLogContract.address,
        TestLogContract.events.ExampleEvent1,
        firstBlockNumber,
        numBlocks,
        [account1Address, account2Address],
      );

      expect(collectedEvent0s.length).toBe(10); // 2 events per tx * 5 txs
      expect(collectedEvent1s.length).toBe(5); // 1 event per tx * 5 txs

      const emptyEvent1s = await wallet.getPrivateEvents<ExampleEvent1>(
        testLogContract.address,
        TestLogContract.events.ExampleEvent1,
        firstBlockNumber,
        numBlocks,
        [account1Address],
      );

      expect(emptyEvent1s.length).toBe(5); // Events sent to msg_sender()

      const exampleEvent0Sort = (a: ExampleEvent0, b: ExampleEvent0) => (a.value0 > b.value0 ? 1 : -1);
      // Each preimage is used twice for ExampleEvent0
      const expectedEvent0s = [...preimages, ...preimages].map(preimage => ({
        value0: preimage[0].toBigInt(),
        value1: preimage[1].toBigInt(),
      }));
      expect(collectedEvent0s.sort(exampleEvent0Sort)).toStrictEqual(expectedEvent0s.sort(exampleEvent0Sort));

      const exampleEvent1Sort = (a: ExampleEvent1, b: ExampleEvent1) => (a.value2 > b.value2 ? 1 : -1);
      expect(collectedEvent1s.sort(exampleEvent1Sort)).toStrictEqual(
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
        .send({ from: account1Address })
        .wait();
      await timesParallel(3, () =>
        testLogContract.methods.emit_unencrypted_events(preimage[++i]).send({ from: account1Address }).wait(),
      );
      const lastTx = await testLogContract.methods
        .emit_unencrypted_events(preimage[++i])
        .send({ from: account1Address })
        .wait();

      const collectedEvent0s = await getDecodedPublicEvents<ExampleEvent0>(
        aztecNode,
        TestLogContract.events.ExampleEvent0,
        firstTx.blockNumber!,
        lastTx.blockNumber! - firstTx.blockNumber! + 1,
      );

      const collectedEvent1s = await getDecodedPublicEvents<ExampleEvent1>(
        aztecNode,
        TestLogContract.events.ExampleEvent1,
        firstTx.blockNumber!,
        lastTx.blockNumber! - firstTx.blockNumber! + 1,
      );

      expect(collectedEvent0s.length).toBe(5);
      expect(collectedEvent1s.length).toBe(5);

      const exampleEvent0Sort = (a: ExampleEvent0, b: ExampleEvent0) => (a.value0 > b.value0 ? 1 : -1);
      expect(collectedEvent0s.sort(exampleEvent0Sort)).toStrictEqual(
        preimage
          .map(preimage => ({ value0: preimage[0].toBigInt(), value1: preimage[1].toBigInt() }))
          .sort(exampleEvent0Sort),
      );

      const exampleEvent1Sort = (a: ExampleEvent1, b: ExampleEvent1) => (a.value2 > b.value2 ? 1 : -1);
      expect(collectedEvent1s.sort(exampleEvent1Sort)).toStrictEqual(
        preimage
          .map(preimage => ({
            value2: new AztecAddress(preimage[2]),
            // We get the last byte here because value3 is of type u8
            value3: BigInt(preimage[3].toBuffer().subarray(31).readUint8()),
          }))
          .sort(exampleEvent1Sort),
      );
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
          .send({ from: account1Address })
          .wait();

        const blockNumber = tx.blockNumber!;

        // Fetch raw private logs for that block and check tag uniqueness
        const privateLogs = await aztecNode.getPrivateLogs(blockNumber, 1);
        const logs = privateLogs.filter(l => !l.isEmpty());

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
          .send({ from: account1Address })
          .wait();

        const blockNumber = tx.blockNumber!;

        // Fetch raw private logs for that block and check tag uniqueness
        const privateLogs = await aztecNode.getPrivateLogs(blockNumber, 1);
        const logs = privateLogs.filter(l => !l.isEmpty());

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
