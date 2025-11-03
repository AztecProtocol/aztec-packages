import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
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
  let blockHash: L2BlockHash;
  let eventSelector: EventSelector;
  let txHash: TxHash;
  let eventCommitmentIndex: number;

  beforeEach(async () => {
    const store = await openTmpStore('private_event_data_provider_test');
    privateEventDataProvider = new PrivateEventDataProvider(store);
    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();
    msgContent = getRandomMsgContent();
    blockNumber = 123;
    blockHash = L2BlockHash.random();
    eventSelector = EventSelector.random();
    txHash = TxHash.random();
    eventCommitmentIndex = randomInt(10);
  });

  it('stores and retrieves private events', async () => {
    const expectedEvent = {
      recipient,
      msgContent,
      txHash,
      blockNumber,
      blockHash,
    };

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
      blockHash,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([expectedEvent]);
  });

  it('ignores duplicate events with same eventCommitmentIndex', async () => {
    const expectedEvent = {
      recipient,
      msgContent,
      txHash,
      blockNumber,
      blockHash,
    };

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
      blockHash,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
      blockHash,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([expectedEvent]);
  });

  it('allows multiple events with same content but different eventCommitmentIndex', async () => {
    const expectedEvent = {
      recipient,
      msgContent,
      txHash,
      blockNumber,
      blockHash,
    };

    const otherEventCommitmentIndex = eventCommitmentIndex + 1;
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
      blockHash,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      otherEventCommitmentIndex,
      blockNumber,
      blockHash,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([expectedEvent, expectedEvent]);
  });

  it('filters events by block range', async () => {
    const expectedEvent = {
      recipient,
      msgContent,
      txHash: TxHash.random(),
      blockNumber: 200,
      blockHash,
    };

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomMsgContent(),
      TxHash.random(),
      0,
      100,
      blockHash,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      expectedEvent.txHash,
      1,
      expectedEvent.blockNumber,
      blockHash,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomMsgContent(),
      TxHash.random(),
      2,
      300,
      blockHash,
    );

    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      150,
      100,
      [recipient],
      eventSelector,
    );

    expect(events).toEqual([expectedEvent]); // Only includes event from block 200
  });

  it('filters events by recipient', async () => {
    const expectedEvent = {
      recipient,
      msgContent,
      txHash,
      blockNumber,
      blockHash,
    };

    const otherRecipient = await AztecAddress.random();
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
      blockHash,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      otherRecipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      eventCommitmentIndex + 1,
      blockNumber,
      blockHash,
    );

    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([expectedEvent]);
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

  describe('event ordering', () => {
    let msgContent1: Fr[];
    let msgContent2: Fr[];
    let msgContent3: Fr[];

    beforeAll(() => {
      msgContent1 = getRandomMsgContent();
      msgContent2 = getRandomMsgContent();
      msgContent3 = getRandomMsgContent();
    });

    it('returns events in order by eventCommitmentIndex', async () => {
      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent2,
        TxHash.random(),
        1, // eventCommitmentIndex
        200,
        blockHash,
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent1,
        TxHash.random(),
        0, // eventCommitmentIndex
        100,
        blockHash,
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent3,
        TxHash.random(),
        2, // eventCommitmentIndex
        300,
        blockHash,
      );

      const events = await privateEventDataProvider.getPrivateEvents(
        contractAddress,
        0,
        1000,
        [recipient],
        eventSelector,
      );

      expect(events.map(e => e.msgContent)).toEqual([msgContent1, msgContent2, msgContent3]);
    });
  });
});
