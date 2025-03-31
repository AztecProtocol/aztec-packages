import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

import { PrivateEventDataProvider } from './private_event_data_provider.js';

const getRandomLogContent = () => {
  return [Fr.random(), Fr.random(), Fr.random()];
};

describe('PrivateEventDataProvider', () => {
  let privateEventDataProvider: PrivateEventDataProvider;
  let contractAddress: AztecAddress;
  let recipient: AztecAddress;
  let logContent: Fr[];
  let blockNumber: number;
  let eventSelector: EventSelector;
  let txHash: TxHash;
  let logIndexInTx: number;

  beforeEach(async () => {
    const store = await openTmpStore('private_event_data_provider_test');
    privateEventDataProvider = new PrivateEventDataProvider(store);
    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();
    logContent = getRandomLogContent();
    blockNumber = 123;
    eventSelector = EventSelector.random();
    txHash = TxHash.random();
    logIndexInTx = randomInt(10);
  });

  it('stores and retrieves private events', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([logContent]);
  });

  it('ignores duplicate events with same txHash and logIndexInTx', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([logContent]);
  });

  it('allows multiple events with same content but different txHash', async () => {
    const otherTxHash = TxHash.random();
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      otherTxHash,
      logIndexInTx,
      blockNumber,
    );
    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([logContent, logContent]);
  });

  it('filters events by block range', async () => {
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomLogContent(),
      TxHash.random(),
      logIndexInTx,
      100,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      TxHash.random(),
      logIndexInTx,
      200,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      getRandomLogContent(),
      TxHash.random(),
      logIndexInTx,
      300,
    );

    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      150,
      100,
      [recipient],
      eventSelector,
    );

    expect(events).toEqual([logContent]); // Only includes event from block 200
  });

  it('filters events by recipient', async () => {
    const otherRecipient = await AztecAddress.random();
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      otherRecipient,
      eventSelector,
      logContent,
      TxHash.random(),
      logIndexInTx,
      blockNumber,
    );

    const events = await privateEventDataProvider.getPrivateEvents(
      contractAddress,
      blockNumber,
      1,
      [recipient],
      eventSelector,
    );
    expect(events).toEqual([logContent]);
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
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(1);

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      txHash,
      logIndexInTx,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(1); // Duplicate event not stored

    await privateEventDataProvider.storePrivateEventLog(
      contractAddress,
      recipient,
      eventSelector,
      logContent,
      TxHash.random(),
      logIndexInTx,
      blockNumber,
    );
    expect(await privateEventDataProvider.getSize()).toBe(2);
  });
});
