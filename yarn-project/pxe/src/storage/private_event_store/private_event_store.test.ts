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
import type { CanonicalityCheck, L2BlockId } from '../foundation/index.js';
import { PrivateEventStore } from './private_event_store.js';

const getRandomMsgContent = () => {
  return [Fr.random(), Fr.random(), Fr.random()];
};

describe('PrivateEventStore', () => {
  let kvStore: AztecAsyncKVStore;
  let privateEventStore: PrivateEventStore;
  let canonicityStore: PrivateEventStore;
  let canonical: Set<string>;
  let check: CanonicalityCheck;
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
    canonical = new Set<string>();
    check = { isCanonical: o => canonical.has(`${o.number}:${o.hash}`) };
    // Most tests don't exercise canonicality filtering; use an always-true check so stored events are always visible.
    privateEventStore = new PrivateEventStore(kvStore, { isCanonical: () => true });
    // A second store on the same KV store, wired with the set-backed check so getPrivateEvents cross-checks can toggle
    // canonicality at runtime.
    canonicityStore = new PrivateEventStore(kvStore, check);
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

  it('hides events whose block is not canonical and shows them once it is', async () => {
    const blockHash = BlockHash.random();
    const blockNumber = BlockNumber(5);

    // Use the set-backed check so we can toggle canonicality at runtime.
    const store = await openTmpStore('canonicality_test');
    const canonicityStore = new PrivateEventStore(store, check);

    await canonicityStore.storePrivateEventLog(
      eventSelector,
      randomness,
      msgContent,
      siloedEventCommitment,
      {
        contractAddress,
        scope,
        txHash,
        l2BlockNumber: blockNumber,
        l2BlockHash: blockHash,
        txIndexInBlock: 0,
        eventIndexInTx: 0,
      },
      'test',
    );
    await canonicityStore.commit('test');

    const filter = { contractAddress, fromBlock: blockNumber, toBlock: blockNumber + 1, scopes: [scope] };

    expect(await canonicityStore.getPrivateEvents(eventSelector, filter)).toHaveLength(0);

    canonical.add(`${blockNumber}:${blockHash.toString()}`);
    expect(await canonicityStore.getPrivateEvents(eventSelector, filter)).toHaveLength(1);
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

  describe('reapNonCanonicalInRange', () => {
    // Two distinct, valid block-hash values for the orphan/canonical forks.
    const ORPHAN_HASH = BlockHash.fromString('0x0a');
    const CANONICAL_HASH = BlockHash.fromString('0x0c');

    const storeEvent = async (
      store: PrivateEventStore,
      eventCommitment: Fr,
      blockNumber: BlockNumber,
      blockHash: BlockHash,
    ) => {
      await store.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        eventCommitment,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: blockNumber,
          l2BlockHash: blockHash,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
    };

    it('reaps only non-canonical events in the given block range, keeping the canonical sibling', async () => {
      // Two events at the SAME block sharing contractAddress + eventSelector (so they share the
      // #eventsByContractAndEventSelector index), distinguished only by their siloedEventCommitment and block hash.
      const orphanEventId = Fr.random();
      const canonicalEventId = Fr.random();
      await storeEvent(canonicityStore, orphanEventId, BlockNumber(9), ORPHAN_HASH);
      await storeEvent(canonicityStore, canonicalEventId, BlockNumber(9), CANONICAL_HASH);
      await canonicityStore.commit('test');

      // The reap predicate is independent of the store's #check; it selects the canonical fork by block hash.
      const isCanonical = (id: L2BlockId) => id.hash === CANONICAL_HASH.toString();
      await kvStore.transactionAsync(() => canonicityStore.reapNonCanonicalInRange(9, 9, isCanonical));

      // Direct index read (independent of #check): only the canonical event survives, the shared-index sibling is gone.
      expect(await canonicityStore.eventIdsAtBlock(9)).toEqual([canonicalEventId.toString()]);

      // getPrivateEvents cross-check: marking the canonical fork canonical shows exactly one event. This proves the
      // shared #eventsByContractAndEventSelector index had only the orphan's value removed (deleteValue), not the whole
      // contract+selector key — the canonical sibling is still reachable through that index.
      canonical.add(`${BlockNumber(9)}:${CANONICAL_HASH.toString()}`);
      const events = await canonicityStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 9,
        toBlock: 10,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].l2BlockHash.equals(CANONICAL_HASH)).toBe(true);
    });

    it('keeps a canonical event in the reaped range', async () => {
      const canonicalEventId = Fr.random();
      await storeEvent(canonicityStore, canonicalEventId, BlockNumber(9), CANONICAL_HASH);
      await canonicityStore.commit('test');

      const isCanonical = (id: L2BlockId) => id.hash === CANONICAL_HASH.toString();
      await kvStore.transactionAsync(() => canonicityStore.reapNonCanonicalInRange(9, 9, isCanonical));

      // Direct index read confirms the canonical event stays.
      expect(await canonicityStore.eventIdsAtBlock(9)).toEqual([canonicalEventId.toString()]);

      // getPrivateEvents cross-check: mark the canonical fork canonical for the harness #check, then read it back.
      canonical.add(`${BlockNumber(9)}:${CANONICAL_HASH.toString()}`);
      const events = await canonicityStore.getPrivateEvents(eventSelector, {
        contractAddress,
        fromBlock: 9,
        toBlock: 10,
        scopes: [scope],
      });
      expect(events).toHaveLength(1);
      expect(events[0].packedEvent).toEqual(msgContent);
    });

    it('leaves events outside the [fromBlock, toBlock] range untouched even if non-canonical', async () => {
      const outOfRangeEventId = Fr.random();
      await storeEvent(privateEventStore, outOfRangeEventId, BlockNumber(20), ORPHAN_HASH);
      await privateEventStore.commit('test');

      // Predicate would call everything non-canonical, but block 20 is outside the reaped range [9, 9].
      await kvStore.transactionAsync(() => privateEventStore.reapNonCanonicalInRange(9, 9, () => false));

      expect(await privateEventStore.eventIdsAtBlock(20)).toEqual([outOfRangeEventId.toString()]);
    });
  });

  describe('deleteInBlockRange', () => {
    const BLOCK_HASH_9 = BlockHash.fromString(Fr.fromString('0x09').toString());
    const BLOCK_HASH_10 = BlockHash.fromString(Fr.fromString('0x0a').toString());

    it('deletes every event in the range, leaving lower blocks intact', async () => {
      const eventAt9 = Fr.random();
      const eventAt10 = Fr.random();

      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        eventAt9,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(9),
          l2BlockHash: BLOCK_HASH_9,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.storePrivateEventLog(
        eventSelector,
        randomness,
        msgContent,
        eventAt10,
        {
          contractAddress,
          scope,
          txHash: TxHash.random(),
          l2BlockNumber: BlockNumber(10),
          l2BlockHash: BLOCK_HASH_10,
          txIndexInBlock: 0,
          eventIndexInTx: 0,
        },
        'test',
      );
      await privateEventStore.commit('test');

      await kvStore.transactionAsync(() => privateEventStore.deleteInBlockRange(10, 10));

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

  afterEach(async () => {
    await kvStore.close();
  });
});
