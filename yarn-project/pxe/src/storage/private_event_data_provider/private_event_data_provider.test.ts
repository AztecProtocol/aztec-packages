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
  let eventCommitmentIndex: number;

  beforeEach(async () => {
    const store = await openTmpStore('private_event_data_provider_test');
    privateEventDataProvider = new PrivateEventDataProvider(store);
    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();
    msgContent = getRandomMsgContent();
    blockNumber = 123;
    eventSelector = EventSelector.random();
    txHash = TxHash.random();
    eventCommitmentIndex = randomInt(10);
  });

  it('stores and retrieves private events', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
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

  it('ignores duplicate events with same eventCommitmentIndex', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
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

  it('allows multiple events with same content but different eventCommitmentIndex', async () => {
    const otherEventCommitmentIndex = eventCommitmentIndex + 1;
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      otherEventCommitmentIndex,
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
      0,
      100,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      1,
      200,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomMsgContent(),
      TxHash.random(),
      2,
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
      eventCommitmentIndex,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      otherRecipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      eventCommitmentIndex + 1,
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
      eventCommitmentIndex,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(1);

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      txHash,
      eventCommitmentIndex,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(1); // Duplicate event not stored

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      msgContent,
      TxHash.random(),
      eventCommitmentIndex + 1,
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

    it('returns events in order by eventCommitmentIndex', async () => {
      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent2,
        TxHash.random(),
        1, // eventCommitmentIndex
        200,
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent1,
        TxHash.random(),
        0, // eventCommitmentIndex
        100,
      );

      await privateEventDataProvider.storePrivateEventLog(
        contractAddress,
        recipient,
        eventSelector,
        msgContent3,
        TxHash.random(),
        2, // eventCommitmentIndex
        300,
      );

      const events = await privateEventDataProvider.getPrivateEvents(
        contractAddress,
        0,
        1000,
        [recipient],
        eventSelector,
      );

      expect(events).toEqual([msgContent1, msgContent2, msgContent3]);
    });
  });
});
