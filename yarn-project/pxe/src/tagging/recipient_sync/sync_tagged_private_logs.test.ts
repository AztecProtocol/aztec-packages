import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times, timesParallel } from '@aztec/foundation/collection';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  type AppTaggingSecret,
  AppTaggingSecretKind,
  type PrivateLogsQuery,
  type SiloedTag,
  randomLogResult,
} from '@aztec/stdlib/logs';
import { randomAppTaggingSecret } from '@aztec/stdlib/testing';
import { BlockHeader } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import {
  INITIAL_CONSTRAINED_PROBE_LEN,
  UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
  syncTaggedPrivateLogs,
} from '../index.js';
import { computeSiloedTagForIndex, extractTags } from '../testing/tag_query_test_utils.js';

const FAR_FUTURE_BLOCK_NUMBER = BlockNumber(100);
const CURRENT_TIMESTAMP = BigInt(Math.floor(Date.now() / 1000));
const ANCHOR_BLOCK_HEADER = BlockHeader.random({ blockNumber: FAR_FUTURE_BLOCK_NUMBER, timestamp: CURRENT_TIMESTAMP });
const CHANGE_SET_ID = 'test-change-set';
const FINALIZED_BLOCK_NUMBER = BlockNumber(10);
// Old enough that the log is past MAX_TX_LIFETIME and may advance the aged index.
const AGED_TIMESTAMP = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;
// Recent enough that the log could still belong to a pending tx and must not advance the aged index.
const RECENT_TIMESTAMP = CURRENT_TIMESTAMP - 5000n;

describe('syncTaggedPrivateLogs', () => {
  const aztecNode: MockProxy<AztecNode> = mock<AztecNode>();
  let taggingStore: RecipientTaggingStore;

  function computeSiloedTags(secret: AppTaggingSecret, indexes: number[]): Promise<SiloedTag[]> {
    return Promise.all(indexes.map(i => computeSiloedTagForIndex(secret, i)));
  }

  /** Computes the tags of `count` contiguous indexes starting at `firstIndex`. */
  function computeSiloedTagRange(secret: AppTaggingSecret, count: number, firstIndex = 0): Promise<SiloedTag[]> {
    return computeSiloedTags(
      secret,
      times(count, i => firstIndex + i),
    );
  }

  function makeLog(blockNumber: number, blockTimestamp: bigint) {
    return { ...randomLogResult(/* includeEffects */ true), blockNumber: BlockNumber(blockNumber), blockTimestamp };
  }

  /** Mocks the node to return one log per matching tag per group, at the group's block number and timestamp. */
  function mockNodeWithLogGroups(groups: { tags: SiloedTag[]; blockNumber?: number; blockTimestamp?: bigint }[]) {
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          groups.flatMap(group =>
            group.tags
              .filter(tag => tag.equals(t))
              .map(() =>
                makeLog(group.blockNumber ?? Number(FINALIZED_BLOCK_NUMBER), group.blockTimestamp ?? AGED_TIMESTAMP),
              ),
          ),
        ),
      );
    });
  }

  /** Mocks the node to return one aged, finalized log per matching tag; repeat a tag to return multiple logs for it. */
  function mockNodeWithLogs(logTags: SiloedTag[], blockNumber?: number, blockTimestamp?: bigint) {
    mockNodeWithLogGroups([{ tags: logTags, blockNumber, blockTimestamp }]);
  }

  /** Runs syncTaggedPrivateLogs against the mocked node and the store under test. */
  function sync(
    secrets: AppTaggingSecret[],
    finalizedBlockNumber = FINALIZED_BLOCK_NUMBER,
    header = ANCHOR_BLOCK_HEADER,
  ) {
    return syncTaggedPrivateLogs(secrets, aztecNode, taggingStore, header, finalizedBlockNumber, CHANGE_SET_ID);
  }

  /** The tags queried by the `callIndex`-th RPC call. */
  function calledTags(callIndex = 0): SiloedTag[] {
    return extractTags(aztecNode.getPrivateLogsByTags.mock.calls[callIndex][0]);
  }

  /** The number of tags queried by each RPC call, in call order. */
  function callSizes(): number[] {
    return aztecNode.getPrivateLogsByTags.mock.calls.map(([query]) => extractTags(query).length);
  }

  /** Every tag queried across all RPC calls, in call order. */
  function allCalledTags(): SiloedTag[] {
    return aztecNode.getPrivateLogsByTags.mock.calls.flatMap(([query]) => extractTags(query));
  }

  beforeEach(async () => {
    aztecNode.getPrivateLogsByTags.mockReset();
    taggingStore = new RecipientTaggingStore(await openTmpStore('test'));
  });

  it('returns empty array when given no secrets', async () => {
    const logs = await sync([]);

    expect(logs).toHaveLength(0);
    expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
  });

  it('returns empty array when no logs found for any secret', async () => {
    const secrets = await makeSecrets(3, AppTaggingSecretKind.UNCONSTRAINED);
    mockNodeWithLogs([]);

    const logs = await sync(secrets);

    expect(logs).toHaveLength(0);
  });

  it('batches tags from multiple secrets across as few RPC calls as the RPC limit allows', async () => {
    // Pick enough secrets that the total tag count spans several MAX_RPC_LEN chunks. A per-secret
    // implementation would need one RPC per secret; batched behavior needs ceil(totalTags / MAX_RPC_LEN).
    const numSecrets = 10;
    const secrets = await makeSecrets(numSecrets, AppTaggingSecretKind.UNCONSTRAINED);
    mockNodeWithLogs([]);

    await sync(secrets);

    const expectedTags = (
      await Promise.all(secrets.map(secret => computeSiloedTagRange(secret, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN)))
    ).flat();
    const asStrings = (tags: SiloedTag[]) => tags.map(t => t.toString()).sort();

    // Every expected (secret, index) tag was queried exactly once, in some order across the batched RPC calls.
    expect(asStrings(allCalledTags())).toEqual(asStrings(expectedTags));

    // Batching invariant: the sync issues ceil(totalTags / MAX_RPC_LEN) calls, which is strictly fewer than one
    // RPC per secret. This is what a per-secret implementation would degenerate to.
    const expectedCalls = Math.ceil(expectedTags.length / MAX_RPC_LEN);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(expectedCalls);
    expect(expectedCalls).toBeLessThan(numSecrets);
  });

  it('syncs logs and updates store independently per secret', async () => {
    const secrets = await makeSecrets(3, AppTaggingSecretKind.UNCONSTRAINED);

    const log1Index = 3;
    const log2Index = 7;
    mockNodeWithLogs([
      await computeSiloedTagForIndex(secrets[0], log1Index),
      await computeSiloedTagForIndex(secrets[1], log2Index),
    ]);

    const logs = await sync(secrets);

    expect(logs).toHaveLength(2);
    expect(await taggingStore.getHighestAgedIndex(secrets[0], CHANGE_SET_ID)).toBe(log1Index);
    expect(await taggingStore.getHighestFinalizedIndex(secrets[0], CHANGE_SET_ID)).toBe(log1Index);
    expect(await taggingStore.getHighestAgedIndex(secrets[1], CHANGE_SET_ID)).toBe(log2Index);
    expect(await taggingStore.getHighestFinalizedIndex(secrets[1], CHANGE_SET_ID)).toBe(log2Index);
    // secrets[2] found nothing, so its store must be untouched
    expect(await taggingStore.getHighestAgedIndex(secrets[2], CHANGE_SET_ID)).toBeUndefined();
    expect(await taggingStore.getHighestFinalizedIndex(secrets[2], CHANGE_SET_ID)).toBeUndefined();
  });

  it('does not advance aged index for recent logs', async () => {
    const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

    const logIndex = 5;
    mockNodeWithLogs(
      [await computeSiloedTagForIndex(secret, logIndex)],
      Number(FINALIZED_BLOCK_NUMBER),
      RECENT_TIMESTAMP,
    );

    const logs = await sync([secret]);

    // The recent log is still returned to the caller: recency only gates the aged index, not delivery.
    expect(logs).toHaveLength(1);
    expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(logIndex);
    expect(await taggingStore.getHighestAgedIndex(secret, CHANGE_SET_ID)).toBeUndefined();
  });

  it('updates store correctly when multiple iterations are needed', async () => {
    const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

    // A log at the last index of the initial window [0, WINDOW_LEN) moves the finalized index to WINDOW_LEN - 1,
    // which shifts the next window forward and triggers a second iteration. A second log sits in the advanced
    // window, only reachable in the second iteration.
    const lastIndexInInitialWindow = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN - 1;
    const newWindowIndex = lastIndexInInitialWindow + 3;
    mockNodeWithLogs(await computeSiloedTags(secret, [lastIndexInInitialWindow, newWindowIndex]));

    const logs = await sync([secret]);

    expect(logs).toHaveLength(2);
    expect(await taggingStore.getHighestAgedIndex(secret, CHANGE_SET_ID)).toBe(newWindowIndex);
    expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(newWindowIndex);
  });

  it('respects pre-existing store indexes', async () => {
    const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

    const existingAgedIndex = 5;
    const existingFinalizedIndex = 8;
    await taggingStore.updateHighestAgedIndex(secret, existingAgedIndex, CHANGE_SET_ID);
    await taggingStore.updateHighestFinalizedIndex(secret, existingFinalizedIndex, CHANGE_SET_ID);
    mockNodeWithLogs([]);

    await sync([secret]);

    // The query window must start at existingAgedIndex+1 and end at existingFinalizedIndex+WINDOW_LEN (inclusive).
    const expectedStart = existingAgedIndex + 1;
    const expectedEnd = existingFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
    expect(calledTags()).toEqual(await computeSiloedTagRange(secret, expectedEnd - expectedStart + 1, expectedStart));
  });

  it('handles multiple logs at the same tag index', async () => {
    const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

    // The tag appears twice, so the node returns two logs for it.
    const logTag = await computeSiloedTagForIndex(secret, 3);
    mockNodeWithLogs([logTag, logTag]);

    const logs = await sync([secret]);

    expect(logs).toHaveLength(2);
  });

  describe('constrained secrets', () => {
    it('stops at first gap and does not track aged index', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      mockNodeWithLogs(await computeSiloedTags(secret, [0, 1, 2]));

      const logs = await sync([secret]);

      expect(logs).toHaveLength(3);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(2);
      expect(await taggingStore.getHighestAgedIndex(secret, CHANGE_SET_ID)).toBeUndefined();
    });

    it('advances the finalized index only through the finalized prefix', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(5);

      // Indexes 0..3 are finalized; indexes 4 and 5 are hits in a block past the finalized one.
      mockNodeWithLogGroups([
        { tags: await computeSiloedTags(secret, [0, 1, 2, 3]), blockNumber: Number(finalizedBlockNumber) },
        { tags: await computeSiloedTags(secret, [4, 5]), blockNumber: 8, blockTimestamp: RECENT_TIMESTAMP },
      ]);

      const logs = await sync([secret], finalizedBlockNumber);

      // The unfinalized logs (4, 5) are returned to the caller, but the finalized index only advances to the finalized
      // prefix (3): probe advancement is decoupled from the finalized index.
      expect(logs).toHaveLength(6);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(3);
    });

    it('advances the probe past an unfinalized-only first probe', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(5);

      // Indexes 0 and 1 are hits in an unfinalized block (8 > finalized 5); index 2 is the gap. The initial probe
      // covers [0, 1] and both are unfinalized, so the scan must still advance past this all-unfinalized round to reach
      // the gap — gating advancement on finalization would stop after round 1.
      mockNodeWithLogs(await computeSiloedTags(secret, [0, 1]), 8, RECENT_TIMESTAMP);

      const logs = await sync([secret], finalizedBlockNumber);

      expect(logs).toHaveLength(2);
      // Nothing finalized, so the finalized index must not advance.
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBeUndefined();

      // Round 1 probes [0, 1] and advances on the unfinalized hits; round 2 probes [2..5] and stops at the gap (2).
      expect(callSizes()).toEqual([2, 4]);

      // The store only ever advances through finalized logs, so an unfinalized log can never be skipped: since nothing
      // was persisted, a second sync restarts at index 0 and re-fetches both unfinalized logs.
      aztecNode.getPrivateLogsByTags.mockClear();
      const secondSyncLogs = await sync([secret], finalizedBlockNumber);
      expect(secondSyncLogs).toHaveLength(2);
      expect(calledTags()).toEqual(await computeSiloedTags(secret, [0, 1]));
      // The repeat sync saw the same unfinalized-only hits, so the finalized index must still not advance.
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBeUndefined();
    });

    // Pins the probe schedule: the probe doubles each round (2, 4, 8, ...) until the first miss, so K-deep
    // catch-up resolves in ~log2(K) round-trips instead of K + 1. With 3 new logs the windows are [1,2],
    // [3,4,5,6] - round 2 (probe length 4) contains the terminating miss at index 4.
    it('doubling catch-up grows the probe geometrically and stops at the first miss', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // Recipient already synced index 0; three new finalized logs sit at indexes 1..3.
      await taggingStore.updateHighestFinalizedIndex(secret, 0, CHANGE_SET_ID);
      mockNodeWithLogs(await computeSiloedTagRange(secret, 3, 1));

      const logs = await sync([secret]);

      expect(logs).toHaveLength(3);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(3);

      // Probe windows double each round: [1,2], then [3,4,5,6] where index 4 is the terminating miss.
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
      expect(calledTags(0)).toEqual(await computeSiloedTags(secret, [1, 2]));
      expect(calledTags(1)).toEqual(await computeSiloedTags(secret, [3, 4, 5, 6]));
    });

    // Pins the effective per-round query cap and that deep catch-up is linear past the cap, not logarithmic: the probe
    // doubles until it saturates at WINDOW_LEN per round rather than growing without bound.
    it('caps the doubling probe at the window length so deep catch-up advances linearly', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // Recipient already synced index 0; a deep run of finalized logs sits past multiple capped probe windows.
      const newLogs = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN * 3;
      await taggingStore.updateHighestFinalizedIndex(secret, 0, CHANGE_SET_ID);
      mockNodeWithLogs(await computeSiloedTagRange(secret, newLogs, 1));

      const logs = await sync([secret]);

      expect(logs).toHaveLength(newLogs);
      // The capped catch-up still drains the run fully.
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(newLogs);

      // Fixed golden probe sizes for the WINDOW_LEN*3 (=252) run: the probe doubles (2, 4, 8, 16, 32, 64) until the
      // next step would exceed the window, then saturates at the cap (WINDOW_LEN = 84) for the last two rounds. The 84s
      // encode UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN and the doubling prefix encodes INITIAL_CONSTRAINED_PROBE_LEN;
      // update these literals if either constant changes.
      expect(callSizes()).toEqual([2, 4, 8, 16, 32, 64, 84, 84]);
    });

    it('batches tags from multiple constrained secrets into a single RPC call', async () => {
      const secrets = await makeSecrets(3, AppTaggingSecretKind.CONSTRAINED);
      mockNodeWithLogs([]);

      await sync(secrets);

      // One batched call carrying exactly each secret's initial probe tags (indexes 0 and 1): constrained secrets
      // share the same RPC round as everything else rather than getting a call apiece.
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
      expect(calledTags()).toEqual(
        await Promise.all(secrets.flatMap(s => [computeSiloedTagForIndex(s, 0), computeSiloedTagForIndex(s, 1)])),
      );
    });

    it('halts at the first all-miss batch and never probes past the gap', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // Contiguous run 0,1,2 ends at the gap (index 3); a sentinel log sits far past it at index 10. The doubling probe
      // reaches the batch [2..5] spanning the gap (index 3) and stops there, starting no further round, so index 10 is
      // never queried. The sentinel is a falsifying witness: a scan that failed to stop would eventually fetch it.
      mockNodeWithLogs(await computeSiloedTags(secret, [0, 1, 2, 10]));

      const logs = await sync([secret]);

      // Only the contiguous prefix is returned, and the sentinel's index was never queried.
      expect(logs).toHaveLength(3);
      const sentinelTag = await computeSiloedTagForIndex(secret, 10);
      expect(allCalledTags().some(t => t.equals(sentinelTag))).toBe(false);
    });

    it('resets the probe to the initial length on the sync after a cap-saturating catch-up', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // A cold-start run deep enough that the first sync doubles the in-memory probe all the way to the WINDOW_LEN
      // cap. The probe length lives only on the in-memory PendingSecret, so the next sync must start fresh at the
      // initial probe rather than inheriting the saturated one, which would forfeit the steady-state optimization
      // after every catch-up.
      const totalLogs = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN * 3;
      mockNodeWithLogs(await computeSiloedTagRange(secret, totalLogs));

      // First sync catches up the whole run; the finalized index lands on the last index and the probe saturated the
      // cap along the way.
      await sync([secret]);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(totalLogs - 1);
      expect(Math.max(...callSizes())).toBe(UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN);

      // Drop the catch-up's recorded calls (mockClear keeps the implementation; mockReset would not) so the next
      // assertions see only the second sync.
      aztecNode.getPrivateLogsByTags.mockClear();

      // Second sync, no new logs: it must probe two tags at the finalized index + 1, not the saturated probe from
      // the catch-up.
      await sync([secret]);

      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
      const probedTags = calledTags();
      expect(probedTags).toHaveLength(INITIAL_CONSTRAINED_PROBE_LEN);
      expect(probedTags).toEqual(await computeSiloedTagRange(secret, INITIAL_CONSTRAINED_PROBE_LEN, totalLogs));
    });

    it('steady state probes only the initial probe length in a single round', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const finalizedIndex = 8;
      await taggingStore.updateHighestFinalizedIndex(secret, finalizedIndex, CHANGE_SET_ID);
      mockNodeWithLogs([]);

      await sync([secret]);

      // Gapless stream: the first missing tag ends the scan, so steady state costs a single round of a single probe.
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
      expect(calledTags()).toEqual(
        await computeSiloedTagRange(secret, INITIAL_CONSTRAINED_PROBE_LEN, finalizedIndex + 1),
      );
    });

    // Pins the round-trip growth law the ~log2(K) claim is qualified against: catch-up is logarithmic only while the
    // probe is still doubling, then linear at roughly one extra round per WINDOW_LEN once the probe saturates the cap.
    // Each row is [K, expectedRoundTrips], asserted against fixed golden counts rather than re-deriving the schedule.
    // The first five are pure doubling (cap-independent); the last (a WINDOW_LEN*3 run) exercises the cap and so
    // depends on UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN. Update the counts if that window or
    // INITIAL_CONSTRAINED_PROBE_LEN change.
    it.each([
      [1, 1],
      [3, 2],
      [20, 4],
      [50, 5],
      [100, 6],
      [UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN * 3, 8],
    ])('catch-up round-trips grow logarithmically then linearly: K=%i', async (newLogs, expectedRoundTrips) => {
      // A round queries at most WINDOW_LEN tags (the probe cap) with at most one log per tag, so as long as the cap
      // fits in a single RPC, one sync round is exactly one RPC call and the call count is the round-trip count.
      expect(UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN).toBeLessThanOrEqual(MAX_RPC_LEN);

      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // Recipient already synced index 0; K new contiguous finalized logs sit at indexes 1..K.
      await taggingStore.updateHighestFinalizedIndex(secret, 0, CHANGE_SET_ID);
      mockNodeWithLogs(await computeSiloedTagRange(secret, newLogs, 1));

      const logs = await sync([secret]);

      expect(logs).toHaveLength(newLogs);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(newLogs);
      expect(aztecNode.getPrivateLogsByTags.mock.calls).toHaveLength(expectedRoundTrips);
    });

    // Secrets whose probe misses drop out of the sync and are not re-probed in the rounds a straggler keeps driving.
    // This is the unit-level analogue of the bench `mixed` scenario, which the bench (skipped in CI) cannot pin.
    it('drops caught-up secrets from later rounds while a straggler keeps syncing', async () => {
      const idleSecrets = await makeSecrets(4, AppTaggingSecretKind.CONSTRAINED);
      const straggler = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // Idle secrets are caught up at index 5, so their next probe (indexes 6, 7) misses and drops them after round 1.
      // The straggler is at index 0 with 3 new contiguous logs at indexes 1..3.
      const idleFinalizedIndex = 5;
      for (const secret of idleSecrets) {
        await taggingStore.updateHighestFinalizedIndex(secret, idleFinalizedIndex, CHANGE_SET_ID);
      }
      await taggingStore.updateHighestFinalizedIndex(straggler, 0, CHANGE_SET_ID);
      mockNodeWithLogs(await computeSiloedTags(straggler, [1, 2, 3]));

      const logs = await sync([...idleSecrets, straggler]);
      expect(logs).toHaveLength(3);

      // Round 1: 4 idle probes + straggler[1,2]. Round 2 is straggler-only: [3..6] (terminating miss at 4).
      expect(callSizes()).toEqual([10, 4]);
      expect(await taggingStore.getHighestFinalizedIndex(straggler, CHANGE_SET_ID)).toBe(3);

      // Dropping out also means no writes: the caught-up secrets' finalized indexes are untouched by the
      // straggler-driven rounds.
      for (const secret of idleSecrets) {
        expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(idleFinalizedIndex);
      }
    });
  });

  describe('fully drains a cold-start run longer than the window', () => {
    const totalLogs = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 2;

    it('constrained', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);

      // A cold-start run two indexes past one window. Reaching the tail is only possible because the scan bound
      // re-anchors forward to each finalized index found.
      mockNodeWithLogs(await computeSiloedTagRange(secret, totalLogs));

      const logs = await sync([secret]);

      // The whole run is returned and the finalized index lands on the last index, even though the run is longer than
      // a single window.
      expect(logs).toHaveLength(totalLogs);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(totalLogs - 1);

      // Fixed golden probe sizes for the cold-start WINDOW_LEN+2 run: pure doubling with no cap saturation, since the
      // run drains inside the 64-tag round. Depends on INITIAL_CONSTRAINED_PROBE_LEN and, via the run length, on
      // UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN; update if either changes.
      expect(callSizes()).toEqual([2, 4, 8, 16, 32, 64]);

      // The final round spans indexes 62..125 (64 tags), reaching well past a full window (84) even though the run is
      // only WINDOW_LEN+2 long: only possible because the scan bound re-anchored forward to each finalized index found.
      expect(calledTags(5)).toEqual(await computeSiloedTagRange(secret, 64, 62));
    });

    it('unconstrained', async () => {
      const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

      // The same run as the constrained case, but gaps are possible so there is no first-miss stop and no doubling
      // probe: every round covers a full window.
      mockNodeWithLogs(await computeSiloedTagRange(secret, totalLogs));

      const logs = await sync([secret]);

      // Every log is returned and both stored indexes land on the last index. The aged index advances since the logs
      // are old enough, unlike a constrained secret, which never tracks an aged index.
      expect(logs).toHaveLength(totalLogs);
      expect(await taggingStore.getHighestFinalizedIndex(secret, CHANGE_SET_ID)).toBe(totalLogs - 1);
      expect(await taggingStore.getHighestAgedIndex(secret, CHANGE_SET_ID)).toBe(totalLogs - 1);

      // The first round spans the full cold-start window (WINDOW_LEN, the same bound the sender store permits fresh
      // pending indexes under). Because every index hit, the next round re-anchors to another full WINDOW_LEN window
      // ahead of the new finalized index: no small initial probe and no doubling, in contrast to the constrained scan.
      expect(callSizes().slice(0, 2)).toEqual([
        UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
        UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
      ]);
    });
  });

  describe('mixed constrained and unconstrained secrets', () => {
    it('batches both kinds into a single RPC call with different stop conditions', async () => {
      const constrainedSecret = await randomAppTaggingSecret(AppTaggingSecretKind.CONSTRAINED);
      const unconstrainedSecret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);

      mockNodeWithLogs([
        ...(await computeSiloedTags(constrainedSecret, [0, 1])),
        ...(await computeSiloedTags(unconstrainedSecret, [0, 5])),
      ]);

      const logs = await sync([constrainedSecret, unconstrainedSecret]);

      expect(logs).toHaveLength(4);
      expect(await taggingStore.getHighestFinalizedIndex(constrainedSecret, CHANGE_SET_ID)).toBe(1);
      expect(await taggingStore.getHighestAgedIndex(constrainedSecret, CHANGE_SET_ID)).toBeUndefined();
      expect(await taggingStore.getHighestFinalizedIndex(unconstrainedSecret, CHANGE_SET_ID)).toBe(5);

      // Both kinds share one batched query rather than one query per kind.
      const firstCallTags = calledTags();
      const constrainedProbeTag = await computeSiloedTagForIndex(constrainedSecret, 0);
      const unconstrainedProbeTag = await computeSiloedTagForIndex(unconstrainedSecret, 0);
      expect(firstCallTags.some(t => t.equals(constrainedProbeTag))).toBe(true);
      expect(firstCallTags.some(t => t.equals(unconstrainedProbeTag))).toBe(true);
    });
  });

  it('caps the node query to blocks at or before the anchor block', async () => {
    const secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
    const anchorBlock = BlockNumber(10);
    const header = BlockHeader.random({ blockNumber: anchorBlock, timestamp: CURRENT_TIMESTAMP });
    const logTag = await computeSiloedTagForIndex(secret, 3);

    // The mock simulates the node honoring `toBlock` (exclusive). Recipient sync now relies on the node
    // for this filter rather than dropping post-anchor logs client-side.
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      const toBlockExclusive = Number(query.toBlock ?? Infinity);
      const allCandidates = [
        makeLog(Number(anchorBlock) - 1, AGED_TIMESTAMP),
        makeLog(Number(anchorBlock), AGED_TIMESTAMP),
        makeLog(Number(anchorBlock) + 1, AGED_TIMESTAMP),
      ];
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag) ? allCandidates.filter(l => Number(l.blockNumber) < toBlockExclusive) : [],
        ),
      );
    });

    const logs = await sync([secret], FINALIZED_BLOCK_NUMBER, header);

    // Only logs at or before the anchor block should be included — node-side filter drops the post-anchor log.
    expect(logs).toHaveLength(2);
    // Verify the node was called with toBlock = anchorBlock + 1 (exclusive upper bound).
    expect(aztecNode.getPrivateLogsByTags.mock.calls[0][0].toBlock).toBe(BlockNumber(Number(anchorBlock) + 1));
  });
});

function makeSecrets(count: number, kind: AppTaggingSecretKind): Promise<AppTaggingSecret[]> {
  return timesParallel(count, () => randomAppTaggingSecret(kind));
}
