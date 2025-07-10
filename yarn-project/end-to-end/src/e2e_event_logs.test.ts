import { type AccountWalletWithSecretKey, AztecAddress, Fr } from '@aztec/aztec.js';
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

  let wallets: AccountWalletWithSecretKey[];

  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets } = await setup(2));

    await ensureAccountContractsPublished(wallets[0], wallets.slice(0, 2));

    testLogContract = await TestLogContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  describe('functionality around emitting an encrypted log', () => {
    it('emits multiple events as private logs and decodes them', async () => {
      const preimages = makeTuple(5, makeTuple.bind(undefined, 4, Fr.random)) as Tuple<Tuple<Fr, 4>, 5>;

      const txs = await Promise.all(
        preimages.map(preimage =>
          testLogContract.methods.emit_encrypted_events(wallets[1].getAddress(), preimage).send().wait(),
        ),
      );

      const firstBlockNumber = Math.min(...txs.map(tx => tx.blockNumber!));
      const lastBlockNumber = Math.max(...txs.map(tx => tx.blockNumber!));
      const numBlocks = lastBlockNumber - firstBlockNumber + 1;

      // Each emit_encrypted_events call emits 2 ExampleEvent0s and 1 ExampleEvent1
      // So with 5 calls we expect 10 ExampleEvent0s and 5 ExampleEvent1s
      const collectedEvent0s = await wallets[0].getPrivateEvents<ExampleEvent0>(
        testLogContract.address,
        TestLogContract.events.ExampleEvent0,
        firstBlockNumber,
        numBlocks,
        [wallets[0].getAddress(), wallets[1].getAddress()],
      );

      const collectedEvent1s = await wallets[0].getPrivateEvents<ExampleEvent1>(
        testLogContract.address,
        TestLogContract.events.ExampleEvent1,
        firstBlockNumber,
        numBlocks,
        [wallets[0].getAddress(), wallets[1].getAddress()],
      );

      expect(collectedEvent0s.length).toBe(10); // 2 events per tx * 5 txs
      expect(collectedEvent1s.length).toBe(5); // 1 event per tx * 5 txs

      const emptyEvent1s = await wallets[0].getPrivateEvents<ExampleEvent1>(
        testLogContract.address,
        TestLogContract.events.ExampleEvent1,
        firstBlockNumber,
        numBlocks,
        [wallets[0].getAddress()],
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
      const firstTx = await testLogContract.methods.emit_unencrypted_events(preimage[i]).send().wait();
      await timesParallel(3, () => testLogContract.methods.emit_unencrypted_events(preimage[++i]).send().wait());
      const lastTx = await testLogContract.methods.emit_unencrypted_events(preimage[++i]).send().wait();

      const collectedEvent0s = await wallets[0].getPublicEvents<ExampleEvent0>(
        TestLogContract.events.ExampleEvent0,
        firstTx.blockNumber!,
        lastTx.blockNumber! - firstTx.blockNumber! + 1,
      );

      const collectedEvent1s = await wallets[0].getPublicEvents<ExampleEvent1>(
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
  });
});
