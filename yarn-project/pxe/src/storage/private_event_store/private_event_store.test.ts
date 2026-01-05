import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import type { PackedPrivateEvent } from '../../pxe.js';
import { PrivateEventStore } from './private_event_store.js';

const getRandomMsgContent = () => {
  return [Fr.random(), Fr.random(), Fr.random()];
};

describe('PrivateEventStore', () => {
  let privateEventStore: PrivateEventStore;
  let contractAddress: AztecAddress;
  let scope: AztecAddress;
  let msgContent: Fr[];
  let l2BlockNumber: BlockNumber;
  let l2BlockHash: L2BlockHash;
  let eventSelector: EventSelector;
  let txHash: TxHash;
  let eventCommitmentIndex: number;
  let expectedEvent: PackedPrivateEvent;

  beforeEach(async () => {
    const store = await openTmpStore('private_event_store_test');
    privateEventStore = new PrivateEventStore(store);
    contractAddress = await AztecAddress.random();
    scope = await AztecAddress.random();
    msgContent = getRandomMsgContent();
    l2BlockNumber = BlockNumber(123);
    l2BlockHash = L2BlockHash.random();
    eventSelector = EventSelector.random();
    txHash = TxHash.random();
    eventCommitmentIndex = randomInt(10);

    expectedEvent = {
      packedEvent: msgContent,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      eventSelector,
    };
  });

  it('stores and retrieves private events', async () => {
    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, eventCommitmentIndex, {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber,
      l2BlockHash,
    });
    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });
    expect(events).toEqual([expectedEvent]);
  });

  it('ignores duplicate events with same eventCommitmentIndex', async () => {
    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, eventCommitmentIndex, {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber,
      l2BlockHash,
    });

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent]);
  });

  it('allows multiple events with same content but different eventCommitmentIndex', async () => {
    const otherEventCommitmentIndex = eventCommitmentIndex + 1;

    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, eventCommitmentIndex, {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber,
      l2BlockHash,
    });
    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, otherEventCommitmentIndex, {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber,
      l2BlockHash,
    });

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent, expectedEvent]);
  });

  it('filters events by block range', async () => {
    expectedEvent = {
      ...expectedEvent,
      txHash: TxHash.random(),
      l2BlockNumber: BlockNumber(200),
    };

    await privateEventStore.storePrivateEventLog(eventSelector, getRandomMsgContent(), 0, {
      contractAddress,
      scope,
      txHash: TxHash.random(),
      l2BlockNumber: BlockNumber(100),
      l2BlockHash,
    });
    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, 1, {
      contractAddress,
      scope,
      txHash: expectedEvent.txHash,
      l2BlockNumber: expectedEvent.l2BlockNumber,
      l2BlockHash: expectedEvent.l2BlockHash,
    });
    await privateEventStore.storePrivateEventLog(eventSelector, getRandomMsgContent(), 2, {
      contractAddress,
      scope,
      txHash: TxHash.random(),
      l2BlockNumber: BlockNumber(300),
      l2BlockHash,
    });

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: 150,
      toBlock: 150 + 100,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent]); // Only includes event from block 200
  });

  it('filters events by recipient', async () => {
    const otherScope = await AztecAddress.random();

    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, eventCommitmentIndex, {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber,
      l2BlockHash,
    });
    await privateEventStore.storePrivateEventLog(eventSelector, msgContent, eventCommitmentIndex + 1, {
      contractAddress,
      scope: otherScope,
      txHash: TxHash.random(),
      l2BlockNumber,
      l2BlockHash,
    });

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent]);
  });

  it('returns empty array when no events match criteria', async () => {
    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

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
      await privateEventStore.storePrivateEventLog(eventSelector, msgContent2, 1, {
        contractAddress,
        scope,
        txHash: TxHash.random(),
        l2BlockNumber: BlockNumber(200),
        l2BlockHash,
      });

      await privateEventStore.storePrivateEventLog(eventSelector, msgContent1, 0, {
        contractAddress,
        scope,
        txHash: TxHash.random(),
        l2BlockNumber: BlockNumber(100),
        l2BlockHash,
      });

      await privateEventStore.storePrivateEventLog(eventSelector, msgContent3, 2, {
        contractAddress,
        scope,
        txHash: TxHash.random(),
        l2BlockNumber: BlockNumber(300),
        l2BlockHash,
      });

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 0 + 1000,
        scopes: [scope],
      });

      expect(events.map(e => e.packedEvent)).toEqual([msgContent1, msgContent2, msgContent3]);
    });
  });
});
