import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { PrivateEventDataProvider } from './private_event_data_provider.js';

const getRandomMsgContent = () => {
  return [Fr.random(), Fr.random(), Fr.random()];
};

describe('PrivateEventDataProvider', () => {
  let privateEventDataProvider: PrivateEventDataProvider;
  let contractAddress: AztecAddress;
  let recipient: AztecAddress;
  let msgContent: Fr[];
  let blockNumber: number;
  let eventSelector: EventSelector;
  let txHash: TxHash;
  let logIndexInTx: number;
  let txIndexInBlock: number;

  beforeEach(async () => {
    const store = await openTmpStore('private_event_data_provider_test');
    privateEventDataProvider = new PrivateEventDataProvider(store);
    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();
    msgContent = getRandomMsgContent();
    blockNumber = 123;
    eventSelector = EventSelector.random();
    txHash = TxHash.random();
    logIndexInTx = randomInt(10);
    txIndexInBlock = randomInt(10);
  });

  it('stores and retrieves private events', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([msgContent]);
  });

  it('ignores duplicate events with same txHash and logIndexInTx', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([msgContent]);
  });

  it('allows multiple events with same content but different txHash', async () => {
    const otherTxHash = TxHash.random();
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      otherTxHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([msgContent, msgContent]);
  });

  it('filters events by block range', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomMsgContent(),
      TxHash.random(),
      logIndexInTx,
      txIndexInBlock,
      100,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      logIndexInTx,
      txIndexInBlock,
      200,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomMsgContent(),
      TxHash.random(),
      logIndexInTx,
      txIndexInBlock,
      300,
    );

    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      150,
      100,
      [recipient],
      eventSelector,
    );

    expect(events).toEqual([msgContent]); // Only includes event from block 200
  });

  it('filters events by recipient', async () => {
    const otherRecipient = await AztecAddress.random();
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      otherRecipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );

    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([msgContent]);
  });

  it('returns empty array when no events match criteria', async () => {
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([]);
  });

  it('tracks size correctly', async () => {
    expect(await privateEventDataProvider.getSize()).toBe(0);

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(1);

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(1); // Duplicate event not stored

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      logIndexInTx,
      txIndexInBlock,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(2);
  });

  describe('event ordering', () => {
    let msgContent1: Fr[];
    let msgContent2: Fr[];
    let msgContent3: Fr[];

    beforeAll(() => {
      msgContent1 = getRandomMsgContent();
      msgContent2 = getRandomMsgContent();
      msgContent3 = getRandomMsgContent();
    });

    it('returns events in order across different blocks', async () => {
      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent2,
        TxHash.random(),
        0, // logIndexInTx
        0, // txIndexInBlock
        200, // blockNumber
      );

      // Store events in different blocks
      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent1,
        TxHash.random(),
        0, // logIndexInTx
        0, // txIndexInBlock
        100, // blockNumber
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent3,
        TxHash.random(),
        0, // logIndexInTx
        0, // txIndexInBlock
        300, // blockNumber
      );

      // Get events across all blocks
      const events = await privateEventDataProvider.getPrivateEvents(
        contractAddress,
        0, // from
        1000, // numBlocks
        [recipient],
        eventSelector,
      );

      expect(events).toEqual([msgContent1, msgContent2, msgContent3]);
    });

    it('returns events in order within same block but different transactions', async () => {
      const sameBlockNumber = 400;

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent2,
        TxHash.random(),
        0, // logIndexInTx
        1, // txIndexInBlock
        sameBlockNumber,
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent1,
        TxHash.random(),
        0, // logIndexInTx
        0, // txIndexInBlock
        sameBlockNumber,
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent3,
        TxHash.random(),
        0, // logIndexInTx
        2, // txIndexInBlock
        sameBlockNumber,
      );

      // Get events from just that block
      const sameBlockEvents = await privateEventDataProvider.getPrivateEvents(
        contractAddress,
        sameBlockNumber,
        1, // numBlocks
        [recipient],
        eventSelector,
      );

      expect(sameBlockEvents).toEqual([msgContent1, msgContent2, msgContent3]);
    });

    it('returns events in order within the same transaction', async () => {
      const sameTxHash = TxHash.random();

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent3,
        sameTxHash,
        2, // logIndexInTx
        3, // txIndexInBlock
        500, // blockNumber
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent1,
        sameTxHash,
        0, // logIndexInTx
        3, // txIndexInBlock
        500, // blockNumber
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent2,
        sameTxHash,
        1, // logIndexInTx
        3, // txIndexInBlock
        500, // blockNumber
      );

      // Get events from just that block
      const sameTxEvents = await privateEventDataProvider.getPrivateEvents(
        contractAddress,
        500, // from
        1, // numBlocks
        [recipient],
        eventSelector,
      );

      expect(sameTxEvents).toEqual([msgContent1, msgContent2, msgContent3]);
    });
  });
});
