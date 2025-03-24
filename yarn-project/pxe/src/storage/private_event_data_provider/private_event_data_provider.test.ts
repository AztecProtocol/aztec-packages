import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

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
  let tag: Fr;

  beforeEach(async () => {
    const store = await openTmpStore('private_event_data_provider_test');
    privateEventDataProvider = new PrivateEventDataProvider(store);
    contractAddress = await AztecAddress.random();
    recipient = await AztecAddress.random();
    logContent = getRandomLogContent();
    blockNumber = 123;
    tag = Fr.random();
  });

  it('stores and retrieves private events', async () => {
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    const events = await privateEventDataProvider.getPrivateEvents(contractAddress, blockNumber, 1, [recipient]);
    expect(events).toEqual([logContent]);
  });

  it('ignores duplicate events with same tag and content', async () => {
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    const events = await privateEventDataProvider.getPrivateEvents(contractAddress, blockNumber, 1, [recipient]);
    expect(events).toEqual([logContent]);
  });

  it('allows multiple events with same tag but different content', async () => {
    const otherLogContent = getRandomLogContent();
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, otherLogContent, blockNumber);
    const events = await privateEventDataProvider.getPrivateEvents(contractAddress, blockNumber, 1, [recipient]);
    expect(events).toEqual([logContent, otherLogContent]);
  });

  it('filters events by block range', async () => {
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, getRandomLogContent(), 100);
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, 200);
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, getRandomLogContent(), 300);

    const events = await privateEventDataProvider.getPrivateEvents(contractAddress, 150, 100, [recipient]);

    expect(events).toEqual([logContent]); // Only includes event from block 200
  });

  it('filters events by recipient', async () => {
    const otherRecipient = await AztecAddress.random();
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, otherRecipient, logContent, blockNumber);

    const events = await privateEventDataProvider.getPrivateEvents(contractAddress, blockNumber, 1, [recipient]);
    expect(events).toEqual([logContent]);
  });

  it('returns empty array when no events match criteria', async () => {
    const events = await privateEventDataProvider.getPrivateEvents(contractAddress, blockNumber, 1, [recipient]);
    expect(events).toEqual([]);
  });

  it('tracks size correctly', async () => {
    expect(await privateEventDataProvider.getSize()).toBe(0);

    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    expect(await privateEventDataProvider.getSize()).toBe(1);

    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, logContent, blockNumber);
    expect(await privateEventDataProvider.getSize()).toBe(1); // Duplicate event not stored

    const otherLogContent = getRandomLogContent();
    await privateEventDataProvider.storePrivateEventLog(tag, contractAddress, recipient, otherLogContent, blockNumber);
    expect(await privateEventDataProvider.getSize()).toBe(2);
  });
});
