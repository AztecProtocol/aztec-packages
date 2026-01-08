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

const TEST_JOB_ID = 'test-job';

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
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      eventCommitmentIndex,
      { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.commit(TEST_JOB_ID);
    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });
    expect(events).toEqual([expectedEvent]);
  });

  it('ignores duplicate events with same eventCommitmentIndex', async () => {
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      eventCommitmentIndex,
      { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.commit(TEST_JOB_ID);

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

    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      eventCommitmentIndex,
      { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      otherEventCommitmentIndex,
      { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.commit(TEST_JOB_ID);

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

    await privateEventStore.storePrivateEventLog(
      eventSelector,
      getRandomMsgContent(),
      0,
      { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber: BlockNumber(100), l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      1,
      {
        contractAddress,
        scope,
        txHash: expectedEvent.txHash,
        l2BlockNumber: expectedEvent.l2BlockNumber,
        l2BlockHash: expectedEvent.l2BlockHash,
      },
      TEST_JOB_ID,
    );
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      getRandomMsgContent(),
      2,
      { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber: BlockNumber(300), l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.commit(TEST_JOB_ID);

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

    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      eventCommitmentIndex,
      { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      msgContent,
      eventCommitmentIndex + 1,
      { contractAddress, scope: otherScope, txHash: TxHash.random(), l2BlockNumber, l2BlockHash },
      TEST_JOB_ID,
    );
    await privateEventStore.commit(TEST_JOB_ID);

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
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent2,
        1,
        { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber: BlockNumber(200), l2BlockHash },
        TEST_JOB_ID,
      );

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent1,
        0,
        { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber: BlockNumber(100), l2BlockHash },
        TEST_JOB_ID,
      );

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent3,
        2,
        { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber: BlockNumber(300), l2BlockHash },
        TEST_JOB_ID,
      );
      await privateEventStore.commit(TEST_JOB_ID);

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 0 + 1000,
        scopes: [scope],
      });

      expect(events.map(e => e.packedEvent)).toEqual([msgContent1, msgContent2, msgContent3]);
    });
  });

  describe('staging', () => {
    it('stages events without affecting committed storage', async () => {
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // Store committed event
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent,
        eventCommitmentIndex,
        { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
        commitJobId,
      );
      await privateEventStore.commit(commitJobId);

      // Store staged event (not committed)
      const stagedMsgContent = getRandomMsgContent();
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedMsgContent,
        eventCommitmentIndex + 1,
        { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber, l2BlockHash },
        stagingJobId,
      );

      // Without jobId, should only see committed event
      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: l2BlockNumber,
        toBlock: l2BlockNumber + 1,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].packedEvent).toEqual(msgContent);
    });

    it('staged events are visible when reading with jobId', async () => {
      const stagingJobId: string = 'staging-job';

      const stagedMsgContent = getRandomMsgContent();
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedMsgContent,
        eventCommitmentIndex,
        { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
        stagingJobId,
      );

      // Without jobId, should not see the staged event
      const eventsWithoutJobId = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: l2BlockNumber,
        toBlock: l2BlockNumber + 1,
        scopes: [scope],
      });
      expect(eventsWithoutJobId).toHaveLength(0);

      // With jobId, should see the staged event
      const eventsWithJobId = await privateEventStore.getPrivateEvents(
        eventSelector,
        {
          contractAddress,
          fromBlock: l2BlockNumber,
          toBlock: l2BlockNumber + 1,
          scopes: [scope],
        },
        stagingJobId,
      );
      expect(eventsWithJobId).toHaveLength(1);
      expect(eventsWithJobId[0].packedEvent).toEqual(stagedMsgContent);
    });

    it('commit promotes staged events to main storage', async () => {
      const stagingJobId: string = 'staging-job';

      const stagedMsgContent = getRandomMsgContent();
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedMsgContent,
        eventCommitmentIndex,
        { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
        stagingJobId,
      );

      await privateEventStore.commit(stagingJobId);

      // Now should see the event without jobId
      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: l2BlockNumber,
        toBlock: l2BlockNumber + 1,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].packedEvent).toEqual(stagedMsgContent);
    });

    it('discardStaged removes staged events without affecting main', async () => {
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      // Store committed event
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent,
        eventCommitmentIndex,
        { contractAddress, scope, txHash, l2BlockNumber, l2BlockHash },
        commitJobId,
      );
      await privateEventStore.commit(commitJobId);

      // Store staged event (not committed)
      const stagedMsgContent = getRandomMsgContent();
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedMsgContent,
        eventCommitmentIndex + 1,
        { contractAddress, scope, txHash: TxHash.random(), l2BlockNumber, l2BlockHash },
        stagingJobId,
      );

      // Discard staging
      await privateEventStore.discardStaged(stagingJobId);

      // Should only see committed event
      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: l2BlockNumber,
        toBlock: l2BlockNumber + 1,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].packedEvent).toEqual(msgContent);
    });
  });

  describe('rollback', () => {
    let msgContent1: Fr[];
    let msgContent2: Fr[];
    let msgContent3: Fr[];
    let msgContent4: Fr[];

    beforeAll(() => {
      msgContent1 = getRandomMsgContent();
      msgContent2 = getRandomMsgContent();
      msgContent3 = getRandomMsgContent();
      msgContent4 = getRandomMsgContent();
    });

    it('removes events after rollback block', async () => {
      // Store events in blocks 100, 200, 300
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent1,
        0,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(100),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );
      // We add another event in the same block to verify that more events per block work.
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent2,
        1,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(100),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent3,
        2,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(200),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent4,
        3,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(300),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );
      await privateEventStore.commit(TEST_JOB_ID);

      // Rollback to block 150 (should remove events from blocks 200 and 300)
      await privateEventStore.rollbackEventsAfterBlock(150, 300);

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 1000,
        scopes: [scope],
      });

      expect(events.length).toBe(2);
      expect(events[0].packedEvent).toEqual(msgContent1);
      expect(events[1].packedEvent).toEqual(msgContent2);
    });

    it('allows re-adding events after rollback', async () => {
      // After a reorg, the same transaction might be re-included in the chain in the same block and at the same
      // position in the block. This test verifies that this scenario works - i.e. that there is no collision in keys.
      const reorgTxHash = TxHash.random();

      // Store event at block 200
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent1,
        0,
        {
          contractAddress,
          scope,
          txHash: reorgTxHash,
          l2BlockNumber: BlockNumber(200),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );
      await privateEventStore.commit(TEST_JOB_ID);

      // Rollback to block 100
      await privateEventStore.rollbackEventsAfterBlock(100, 200);

      // Verify event was removed
      let events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 1000,
        scopes: [scope],
      });
      expect(events.length).toBe(0);

      // Re-add the same event (same eventCommitmentIndex and txHash, as happens after a reorg)
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent1,
        0,
        {
          contractAddress,
          scope,
          txHash: reorgTxHash,
          l2BlockNumber: BlockNumber(200),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );
      await privateEventStore.commit(TEST_JOB_ID);

      // Verify event can be retrieved again
      events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 1000,
        scopes: [scope],
      });
      expect(events.length).toBe(1);
    });

    it('handles rollback with no events to remove', async () => {
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        msgContent1,
        0,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(100),
          l2BlockHash,
        },
        TEST_JOB_ID,
      );
      await privateEventStore.commit(TEST_JOB_ID);

      // Rollback after all existing events
      await privateEventStore.rollbackEventsAfterBlock(200, 300);

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 1000,
        scopes: [scope],
      });

      expect(events.length).toBe(1);
      expect(events[0].packedEvent).toEqual(msgContent1);
    });
  });
});
