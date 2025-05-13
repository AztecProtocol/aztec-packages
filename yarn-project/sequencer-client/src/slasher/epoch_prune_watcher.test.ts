import { sleep } from '@aztec/aztec.js';
import type { EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type L2BlockSourceEventEmitter, L2BlockSourceEvents } from '@aztec/stdlib/block';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';

import { Offence, WANT_TO_SLASH_EVENT } from './config.js';
import { EpochPruneWatcher } from './epoch_prune_watcher.js';

describe('EpochPruneWatcher', () => {
  let watcher: EpochPruneWatcher;
  let l2BlockSource: L2BlockSourceEventEmitter;
  let epochCache: MockProxy<EpochCache>;
  const penalty = BigInt(1000000000000000000n);

  beforeEach(() => {
    l2BlockSource = new EventEmitter() as unknown as L2BlockSourceEventEmitter;
    epochCache = mock<EpochCache>();
    watcher = new EpochPruneWatcher(l2BlockSource, epochCache, penalty);
    watcher.start();
  });

  afterEach(() => {
    watcher.stop();
  });

  it('should emit WANT_TO_SLASH_EVENT when a validator is in a pruned epoch', async () => {
    const emitSpy = jest.spyOn(watcher, 'emit');

    const committee = ['0x0000000000000000000000000000000000000abc', '0x0000000000000000000000000000000000000def'];
    epochCache.getCommitteeForEpoch.mockResolvedValue({
      committee: committee.map(EthAddress.fromString),
      seed: 0n,
      epoch: 1n,
    });

    l2BlockSource.emit(L2BlockSourceEvents.L2PruneDetected, {
      epochNumber: 1n,
    });

    // Just need to yield to the event loop to clear our synchronous promises
    await sleep(0);

    expect(emitSpy).toHaveBeenCalledWith(WANT_TO_SLASH_EVENT, {
      validators: committee,
      amounts: [penalty, penalty],
      offenses: [Offence.EPOCH_PRUNE, Offence.EPOCH_PRUNE],
    });

    expect(watcher.wantToSlash(EthAddress.fromString(committee[0]), penalty)).toBe(true);
    expect(watcher.wantToSlash(EthAddress.fromString(committee[1]), penalty)).toBe(true);
    expect(watcher.wantToSlash(EthAddress.fromString('0x0000000000000000000000000000000000000000'), penalty)).toBe(
      false,
    );
  });
});
