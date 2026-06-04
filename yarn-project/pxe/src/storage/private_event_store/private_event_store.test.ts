import { BlockNumber } from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import type { PackedPrivateEvent } from '../../pxe.js';
import { PrivateEventStore } from './private_event_store.js';

const getRandomMsgContent = () => {
  return [Fr.random(), Fr.random(), Fr.random()];
};

describe('PrivateEventStore', () => {
  let kvStore: AztecAsyncKVStore;
  let privateEventStore: PrivateEventStore;
  let contractAddress: AztecAddress;
  let scope: AztecAddress;
  let msgContent: Fr[];
  let l2BlockNumber: BlockNumber;
  let l2BlockHash: BlockHash;
  let eventSelector: EventSelector;
  let randomness: Fr;
  let txHash: TxHash;
  let siloedEventCommitment: Fr;
  let expectedEvent: PackedPrivateEvent;

  beforeEach(async () => {
    kvStore = await openTmpStore('private_event_store_test');
    privateEventStore = new PrivateEventStore(kvStore);
    contractAddress = await AztecAddress.random();
    scope = await AztecAddress.random();
    msgContent = getRandomMsgContent();
    l2BlockNumber = BlockNumber(123);
    l2BlockHash = BlockHash.random();
    eventSelector = EventSelector.random();
    randomness = Fr.random();
    txHash = TxHash.random();
    siloedEventCommitment = Fr.random();

    expectedEvent = {
      packedEvent: msgContent,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      eventSelector,
    };
  });

  afterEach(async () => {
    await kvStore.close();
  });

  it('stores and retrieves private events', async () => {
    {
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        siloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.commit('test');
    }

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent]);
  });

  it('ignores duplicate events with same siloedEventCommitment', async () => {
    const metadata = {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      txIndexInBlock: 0,
      eventIndexInTx: 0,
    };

    // Storing the same commitment twice must collapse to a single event: the second store hits the dedup path.
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      randomness,
      msgContent,
      siloedEventCommitment,
      metadata,
      'test',
    );
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      randomness,
      msgContent,
      siloedEventCommitment,
      metadata,
      'test',
    );
    await privateEventStore.commit('test');

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent]);
  });

  it('allows multiple events with same content but different siloedEventCommitment', async () => {
    const otherSiloedEventCommitment = Fr.random();

    {
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        siloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        otherSiloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 1,
        },
        'test',
      );
      await privateEventStore.commit('test');
    }

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

    {
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        getRandomMsgContent(),
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(100),
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash: expectedEvent.txHash,
          l2BlockNumber: expectedEvent.l2BlockNumber,
          l2BlockHash: expectedEvent.l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        getRandomMsgContent(),
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(300),
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.commit('test');
    }

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

    {
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        siloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        Fr.random(),
        {
          contractAddress,
          scope: otherScope,
          txHash: TxHash.random(),
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.commit('test');
    }

    const events = await privateEventStore.getPrivateEvents(eventSelector, {
      contractAddress,
      fromBlock: l2BlockNumber,
      toBlock: l2BlockNumber + 1,
      scopes: [scope],
    });

    expect(events).toEqual([expectedEvent]);
  });

  it('finds event under each scope it was stored with', async () => {
    const scope1 = await AztecAddress.random();
    const scope2 = await AztecAddress.random();
    const eventCommitment = Fr.random();

    const event = {
      contractAddress,
      scope: scope1,
      txHash,
      l2BlockNumber,
      l2BlockHash,
      txIndexInBlock: 0,
      eventIndexInTx: 0,
    };

    await privateEventStore.storePrivateEventLog(eventSelector, randomness, msgContent, eventCommitment, event, 'test');
    await privateEventStore.storePrivateEventLog(
      eventSelector,
      randomness,
      msgContent,
      eventCommitment,
      { ...event, scope: scope2 },
      'test',
    );

    await privateEventStore.commit('test');

    const filter = { contractAddress, fromBlock: l2BlockNumber, toBlock: l2BlockNumber + 1 };

    const eventsScope1 = await privateEventStore.getPrivateEvents(eventSelector, { ...filter, scopes: [scope1] });
    expect(eventsScope1).toHaveLength(1);
    expect(eventsScope1[0].packedEvent).toEqual(msgContent);

    const eventsScope2 = await privateEventStore.getPrivateEvents(eventSelector, { ...filter, scopes: [scope2] });
    expect(eventsScope2).toHaveLength(1);
    expect(eventsScope2[0].packedEvent).toEqual(msgContent);

    // Querying with both scopes returns the event once
    const eventsBoth = await privateEventStore.getPrivateEvents(eventSelector, {
      ...filter,
      scopes: [scope1, scope2],
    });
    expect(eventsBoth).toHaveLength(1);
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

    it('returns events in order by block number', async () => {
      {
        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent2,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber: BlockNumber(200),
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'test',
        );

        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent1,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber: BlockNumber(100),
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'test',
        );

        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent3,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber: BlockNumber(300),
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'test',
        );
        await privateEventStore.commit('test');
      }

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 0 + 1000,
        scopes: [scope],
      });

      expect(events.map(e => e.packedEvent)).toEqual([msgContent1, msgContent2, msgContent3]);
    });

    it('returns events in order by tx index within the same block', async () => {
      const l2BlockNumber = BlockNumber(100);

      {
        // Store events in the same block but different tx indexes (store them out of order)
        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent2,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber,
            l2BlockHash,
            txIndexInBlock: 1,
            eventIndexInTx: 0,
          },
          'test',
        );

        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent1,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber,
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'test',
        );

        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent3,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash: TxHash.random(),
            l2BlockNumber,
            l2BlockHash,
            txIndexInBlock: 2,
            eventIndexInTx: 0,
          },
          'test',
        );
        await privateEventStore.commit('test');
      }

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 1000,
        scopes: [scope],
      });

      expect(events.map(e => e.packedEvent)).toEqual([msgContent1, msgContent2, msgContent3]);
    });

    it('returns events in order by event index within the same tx', async () => {
      const txHash = TxHash.random();
      const l2BlockNumber = BlockNumber(100);

      {
        // Store events in the same block and tx but different event indexes (store them out of order)
        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent2,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash,
            l2BlockNumber,
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 1,
          },
          'test',
        );

        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent1,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash,
            l2BlockNumber,
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 0,
          },
          'test',
        );

        await privateEventStore.storePrivateEventLog(
          eventSelector,
          randomness,
          msgContent3,
          Fr.random(),
          {
            contractAddress,
            scope,
            txHash,
            l2BlockNumber,
            l2BlockHash,
            txIndexInBlock: 0,
            eventIndexInTx: 2,
          },
          'test',
        );
        await privateEventStore.commit('test');
      }

      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 0,
        toBlock: 1000,
        scopes: [scope],
      });

      expect(events.map(e => e.packedEvent)).toEqual([msgContent1, msgContent2, msgContent3]);
    });
  });

  describe('rollback', () => {
    const BLOCK_HASH_9 = BlockHash.fromString(Fr.fromString('0x09').toString());
    const BLOCK_HASH_10 = BlockHash.fromString(Fr.fromString('0x0a').toString());
    const BLOCK_HASH_12 = BlockHash.fromString(Fr.fromString('0x0c').toString());

    const storeEventAt = (commitment: Fr, block: number, blockHash: BlockHash) =>
      privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        commitment,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(block),
          l2BlockHash: blockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );

    it('deletes every event above the target block, leaving lower blocks intact', async () => {
      const eventAt9 = Fr.random();
      const eventAt10 = Fr.random();

      await storeEventAt(eventAt9, 9, BLOCK_HASH_9);
      await storeEventAt(eventAt10, 10, BLOCK_HASH_10);
      await privateEventStore.commit('test');

      await kvStore.transactionAsync(() => privateEventStore.rollback(9));

      // Block 9 event survives; block 10 event is gone.
      expect(await privateEventStore.eventIdsAtBlock(9)).toEqual([eventAt9.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(10)).toHaveLength(0);

      // getPrivateEvents confirms only the block-9 event is retrievable.
      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 9,
        toBlock: 11,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].l2BlockHash.equals(BLOCK_HASH_9)).toBe(true);
    });

    it('sweeps every block above the target, including non-contiguous ones', async () => {
      const eventAt9 = Fr.random();
      const eventAt10 = Fr.random();
      const eventAt12 = Fr.random();

      await storeEventAt(eventAt9, 9, BLOCK_HASH_9);
      await storeEventAt(eventAt10, 10, BLOCK_HASH_10);
      await storeEventAt(eventAt12, 12, BLOCK_HASH_12);
      await privateEventStore.commit('test');

      await kvStore.transactionAsync(() => privateEventStore.rollback(9));

      // Block 9 survives; both 10 and the non-contiguous 12 are swept.
      expect(await privateEventStore.eventIdsAtBlock(9)).toEqual([eventAt9.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(10)).toHaveLength(0);
      expect(await privateEventStore.eventIdsAtBlock(12)).toHaveLength(0);
    });

    it('is idempotent — re-running an already-applied rollback is a no-op', async () => {
      const eventAt9 = Fr.random();
      const eventAt10 = Fr.random();

      await storeEventAt(eventAt9, 9, BLOCK_HASH_9);
      await storeEventAt(eventAt10, 10, BLOCK_HASH_10);
      await privateEventStore.commit('test');

      await kvStore.transactionAsync(() => privateEventStore.rollback(9));
      // Re-running over the already-truncated tail must not throw and must not change anything.
      await kvStore.transactionAsync(() => privateEventStore.rollback(9));

      expect(await privateEventStore.eventIdsAtBlock(9)).toEqual([eventAt9.toString()]);
      expect(await privateEventStore.eventIdsAtBlock(10)).toHaveLength(0);
    });

    it('allows re-adding an event after rollback', async () => {
      // After a reorg, the same transaction can be re-included at the same block and position, producing the same
      // siloed event commitment (this store's key). Rollback must leave no residue behind, so re-storing that
      // commitment succeeds with no key collision and the event becomes retrievable again.
      const commitment = Fr.random();
      const readBack = () =>
        privateEventStore.getPrivateEvents(eventSelector, {
          contractAddress,
          fromBlock: 9,
          toBlock: 11,
          scopes: [scope],
        });

      await storeEventAt(commitment, 10, BLOCK_HASH_10);
      await privateEventStore.commit('test');

      await kvStore.transactionAsync(() => privateEventStore.rollback(9));
      expect(await readBack()).toHaveLength(0);

      // Re-add the same commitment, as happens when the tx is re-included after the reorg.
      await storeEventAt(commitment, 10, BLOCK_HASH_10);
      await privateEventStore.commit('test');
      expect(await readBack()).toHaveLength(1);
    });
  });

  describe('eventIdsAtBlock', () => {
    it('returns the event id of an event stored at a given block', async () => {
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        siloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.commit('test');

      const ids = await privateEventStore.eventIdsAtBlock(l2BlockNumber);
      expect(ids).toContain(siloedEventCommitment.toString());
    });

    it('returns all event ids when multiple events are stored at the same block', async () => {
      const siloedEventCommitment2 = Fr.random();

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        siloedEventCommitment,
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        getRandomMsgContent(),
        siloedEventCommitment2,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 1,
        },
        'test',
      );
      await privateEventStore.commit('test');

      const ids = await privateEventStore.eventIdsAtBlock(l2BlockNumber);
      expect(new Set(ids)).toEqual(new Set([siloedEventCommitment.toString(), siloedEventCommitment2.toString()]));
    });
  });

  describe('staging', () => {
    it('stages events without affecting committed storage', async () => {
      const commitJobId: string = 'commit-job';
      const stagingJobId: string = 'staging-job';

      const committedEventRandomness = Fr.random();
      const stagedEventRandomness = Fr.random();

      // Store committed event
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        committedEventRandomness,
        msgContent,
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: randomInt(100),
          eventIndexInTx: randomInt(100),
        },
        commitJobId,
      );
      await privateEventStore.commit(commitJobId);

      // Store staged event (not committed)
      const stagedMsgContent = getRandomMsgContent();
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedEventRandomness,
        stagedMsgContent,
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: randomInt(100),
          eventIndexInTx: randomInt(100),
        },
        stagingJobId,
      );

      // With a fresh jobId, should only see committed event
      const events = await privateEventStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: l2BlockNumber,
        toBlock: l2BlockNumber + 1,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].packedEvent).toEqual(msgContent);
    });

    it('commit promotes staged events to main storage', async () => {
      const stagingJobId: string = 'staging-job';
      const stagedEventRandomness = Fr.random();
      const stagedMsgContent = getRandomMsgContent();

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedEventRandomness,
        stagedMsgContent,
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: randomInt(100),
          eventIndexInTx: randomInt(100),
        },
        stagingJobId,
      );

      await privateEventStore.commit(stagingJobId);

      // Now should see the event with a fresh jobId
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
      const committedEventRandomness = Fr.random();
      const stagedEventRandomness = Fr.random();

      // Store committed event
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        committedEventRandomness,
        msgContent,
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash,
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: randomInt(100),
          eventIndexInTx: randomInt(100),
        },
        commitJobId,
      );
      await privateEventStore.commit(commitJobId);

      // Store staged event (not committed)
      const stagedMsgContent = getRandomMsgContent();
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        stagedEventRandomness,
        stagedMsgContent,
        Fr.random(),
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber,
          l2BlockHash,
          txIndexInBlock: randomInt(100),
          eventIndexInTx: randomInt(100),
        },
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
});
