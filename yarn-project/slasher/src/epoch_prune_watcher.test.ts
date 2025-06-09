import type { EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { type L2BlockSourceEventEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';
import type { Hex } from 'viem';

import { Offense, WANT_TO_SLASH_EVENT } from './config.js';
import { EpochPruneWatcher } from './epoch_prune_watcher.js';

describe('EpochPruneWatcher', () => {
  let watcher: EpochPruneWatcher;
  let l2BlockSource: L2BlockSourceEventEmitter;
  let epochCache: MockProxy<EpochCache>;
  const penalty = BigInt(1000000000000000000n);
  const maxPenalty = penalty * 2n;

  beforeEach(async () => {
    l2BlockSource = new EventEmitter() as unknown as L2BlockSourceEventEmitter;
    epochCache = mock<EpochCache>();
    watcher = new EpochPruneWatcher(l2BlockSource, epochCache, penalty, maxPenalty);
    await watcher.start();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('should emit WANT_TO_SLASH_EVENT when a validator is in a pruned epoch', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const committee: Hex[] = [
      '0x0000000000000000000000000000000000000abc',
      '0x0000000000000000000000000000000000000def',
    ];
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee: committee.map(EthAddress.fromString),
      seed: 0n,
      epoch: 1n,
    });

    l2BlockSource.emit(L2BlockSourceEvents.L2PruneDetected, {
      epochNumber: 1n,
      blockNumber: 1n,
      slotNumber: 1n,
      type: L2BlockSourceEvents.L2PruneDetected,
    });

    // Just need to yield to the event loop to clear our synchronous promises
    await sleep(0);

    expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, [
      {
        validator: EthAddress.fromString(committee[0]),
        amount: penalty,
        offense: Offense.EPOCH_PRUNE,
      },
      {
        validator: EthAddress.fromString(committee[1]),
        amount: penalty,
        offense: Offense.EPOCH_PRUNE,
      },
    ]);

    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[0]),
        amount: penalty,
        offense: Offense.EPOCH_PRUNE,
      }),
    ).resolves.toBe(true);
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[1]),
        amount: penalty,
        offense: Offense.EPOCH_PRUNE,
      }),
    ).resolves.toBe(true);
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString('0x0000000000000000000000000000000000000000'),
        amount: penalty,
        offense: Offense.EPOCH_PRUNE,
      }),
    ).resolves.toBe(false);

    // Should slash if the penalty is within the max penalty
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[0]),
        amount: maxPenalty,
        offense: Offense.EPOCH_PRUNE,
      }),
    ).resolves.toBe(true);
    // Should not slash if the penalty is above the max penalty
    await expect(
      watcher.shouldSlash({
        validator: EthAddress.fromString(committee[0]),
        amount: maxPenalty + 1n,
        offense: Offense.EPOCH_PRUNE,
      }),
    ).resolves.toBe(false);
  });
});
