import {
  type AccountWalletWithSecretKey,
  AztecAddress,
  type AztecNode,
  EventMetadata,
  Fr,
  L1EventPayload,
} from '@aztec/aztec.js';
import { EventSelector } from '@aztec/foundation/abi';
import { makeTuple } from '@aztec/foundation/array';
import { type Tuple } from '@aztec/foundation/serialize';
import { type ExampleEvent0, type ExampleEvent1, TestLogContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { ensureAccountsPubliclyDeployed, setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('Logs', () => {
  let testLogContract: TestLogContract;
  jest.setTimeout(TIMEOUT);

  let wallets: AccountWalletWithSecretKey[];
  let node: AztecNode;

  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallets, aztecNode: node } = await setup(2));

    await ensureAccountsPubliclyDeployed(wallets[0], wallets.slice(0, 2));

    testLogContract = await TestLogContract.deploy(wallets[0]).send().deployed();
  });

  afterAll(() => teardown());

  describe('functionality around emitting an encrypted log', () => {
    it('emits multiple events as encrypted logs and decodes them one manually', async () => {
      const preimage = makeTuple(4, Fr.random);

      const tx = await testLogContract.methods.emit_encrypted_events(wallets[1].getAddress(), preimage).send().wait();

      const txEffect = await node.getTxEffect(tx.txHash);

      const privateLogs = txEffect!.data.privateLogs;
      expect(privateLogs.length).toBe(3);

      const decryptedEvent0 = L1EventPayload.decryptAsIncoming(privateLogs[0], wallets[0].getEncryptionSecret())!;

      expect(decryptedEvent0.contractAddress).toStrictEqual(testLogContract.address);
      expect(decryptedEvent0.eventTypeId).toStrictEqual(EventSelector.fromSignature('ExampleEvent0(Field,Field)'));

      // We decode our event into the event type
      const event0Metadata = new EventMetadata<ExampleEvent0>(TestLogContract.events.ExampleEvent0);
      const event0 = event0Metadata.decode(decryptedEvent0);

      // We check that the event was decoded correctly
      expect(event0?.value0).toStrictEqual(preimage[0].toBigInt());
      expect(event0?.value1).toStrictEqual(preimage[1].toBigInt());

      const decryptedEvent1 = L1EventPayload.decryptAsIncoming(privateLogs[2], wallets[0].getEncryptionSecret())!;

      const event1Metadata = new EventMetadata<ExampleEvent1>(TestLogContract.events.ExampleEvent1);

      // We check our second event, which is a different type
      const event1 = event1Metadata.decode(decryptedEvent1);

      // We check that an event that does not match, is not decoded correctly due to an event type id mismatch
      const badEvent0 = event1Metadata.decode(decryptedEvent0);
      expect(badEvent0).toBe(undefined);

      expect(decryptedEvent1.contractAddress).toStrictEqual(testLogContract.address);
      expect(decryptedEvent1.eventTypeId).toStrictEqual(EventSelector.fromSignature('ExampleEvent1((Field),u8)'));

      // We expect the fields to have been populated correctly
      expect(event1?.value2).toStrictEqual(new AztecAddress(preimage[2]));
      // We get the last byte here because value3 is of type u8
      expect(event1?.value3).toStrictEqual(BigInt(preimage[3].toBuffer().subarray(31).readUint8()));

      // Again, trying to decode another event with mismatching data does not yield anything
      const badEvent1 = event0Metadata.decode(decryptedEvent1);
      expect(badEvent1).toBe(undefined);
    });

    it('emits multiple events as encrypted logs and decodes them', async () => {
      const preimages = makeTuple(5, makeTuple.bind(undefined, 4, Fr.random)) as Tuple<Tuple<Fr, 4>, 5>;

      const txs = await Promise.all(
        preimages.map(preimage =>
          testLogContract.methods.emit_encrypted_events(wallets[1].getAddress(), preimage).send().wait(),
        ),
      );
      const firstBlockNumber = Math.min(...txs.map(tx => tx.blockNumber!));
      const lastBlockNumber = Math.max(...txs.map(tx => tx.blockNumber!));
      const numBlocks = lastBlockNumber - firstBlockNumber + 1;

      // We get all the events we can decrypt with either our incoming or outgoing viewing keys

      const collectedEvent0s = await wallets[0].getEncryptedEvents<ExampleEvent0>(
        TestLogContract.events.ExampleEvent0,
        firstBlockNumber,
        numBlocks,
      );

      const collectedEvent0sWithIncoming = await wallets[0].getEncryptedEvents<ExampleEvent0>(
        TestLogContract.events.ExampleEvent0,
        firstBlockNumber,
        numBlocks,
        // This function can be called specifying the viewing public keys associated with the encrypted event.
        [wallets[0].getCompleteAddress().publicKeys.masterIncomingViewingPublicKey],
      );

      const collectedEvent0sWithOutgoing = await wallets[0].getEncryptedEvents<ExampleEvent0>(
        TestLogContract.events.ExampleEvent0,
        firstBlockNumber,
        numBlocks,
        [wallets[0].getCompleteAddress().publicKeys.masterOutgoingViewingPublicKey],
      );

      const collectedEvent1s = await wallets[0].getEncryptedEvents<ExampleEvent1>(
        TestLogContract.events.ExampleEvent1,
        firstBlockNumber,
        numBlocks,
        [wallets[0].getCompleteAddress().publicKeys.masterIncomingViewingPublicKey],
      );

      expect(collectedEvent0sWithIncoming.length).toBe(5);
      expect(collectedEvent0sWithOutgoing.length).toBe(5);
      expect(collectedEvent0s.length).toBe(10);
      expect(collectedEvent1s.length).toBe(5);

      const emptyEvent1s = await wallets[0].getEncryptedEvents<ExampleEvent1>(
        TestLogContract.events.ExampleEvent1,
        firstBlockNumber,
        numBlocks,
        [wallets[0].getCompleteAddress().publicKeys.masterOutgoingViewingPublicKey],
      );

      expect(emptyEvent1s.length).toBe(0);

      const exampleEvent0Sort = (a: ExampleEvent0, b: ExampleEvent0) => (a.value0 > b.value0 ? 1 : -1);
      expect(collectedEvent0sWithIncoming.sort(exampleEvent0Sort)).toStrictEqual(
        preimages
          .map(preimage => ({ value0: preimage[0].toBigInt(), value1: preimage[1].toBigInt() }))
          .sort(exampleEvent0Sort),
      );

      expect(collectedEvent0sWithOutgoing.sort(exampleEvent0Sort)).toStrictEqual(
        preimages
          .map(preimage => ({ value0: preimage[0].toBigInt(), value1: preimage[1].toBigInt() }))
          .sort(exampleEvent0Sort),
      );

      expect([...collectedEvent0sWithIncoming, ...collectedEvent0sWithOutgoing].sort(exampleEvent0Sort)).toStrictEqual(
        collectedEvent0s.sort(exampleEvent0Sort),
      );

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

    it('emits multiple events as unencrypted logs and decodes them', async () => {
      const preimage = makeTuple(5, makeTuple.bind(undefined, 4, Fr.random)) as Tuple<Tuple<Fr, 4>, 5>;

      let i = 0;
      const firstTx = await testLogContract.methods.emit_unencrypted_events(preimage[i]).send().wait();
      await Promise.all(
        [...new Array(3)].map(() => testLogContract.methods.emit_unencrypted_events(preimage[++i]).send().wait()),
      );
      const lastTx = await testLogContract.methods.emit_unencrypted_events(preimage[++i]).send().wait();

      const collectedEvent0s = await wallets[0].getUnencryptedEvents<ExampleEvent0>(
        TestLogContract.events.ExampleEvent0,
        firstTx.blockNumber!,
        lastTx.blockNumber! - firstTx.blockNumber! + 1,
      );

      const collectedEvent1s = await wallets[0].getUnencryptedEvents<ExampleEvent1>(
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
