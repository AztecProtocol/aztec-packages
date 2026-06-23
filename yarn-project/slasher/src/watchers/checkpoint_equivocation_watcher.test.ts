import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import {
  type ArchiverEmitter,
  type CheckpointEquivocationDetectedEvent,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';
import { OffenseType } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import EventEmitter from 'node:events';

import { DefaultSlasherConfig, type SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { CheckpointEquivocationWatcher } from './checkpoint_equivocation_watcher.js';

describe('CheckpointEquivocationWatcher', () => {
  let archiverEmitter: ArchiverEmitter;
  let l2BlockSource: Pick<L2BlockSourceEventEmitter, 'events'>;
  let epochCache: MockProxy<Pick<EpochCacheInterface, 'getProposerAttesterAddressInSlot'>>;
  let config: SlasherConfig;
  let watcher: CheckpointEquivocationWatcher;
  let handler: jest.MockedFunction<(args: WantToSlashArgs[]) => void>;

  const makeEvent = (
    overrides: Partial<CheckpointEquivocationDetectedEvent> = {},
  ): CheckpointEquivocationDetectedEvent => ({
    type: L2BlockSourceEvents.CheckpointEquivocationDetected,
    slotNumber: SlotNumber(10),
    checkpointNumber: CheckpointNumber(2),
    l1ArchiveRoot: Buffer32.fromField(Fr.random()),
    proposedArchiveRoot: Fr.random(),
    ...overrides,
  });

  beforeEach(async () => {
    archiverEmitter = new EventEmitter() as unknown as ArchiverEmitter;
    l2BlockSource = { events: archiverEmitter };
    epochCache = mock<Pick<EpochCacheInterface, 'getProposerAttesterAddressInSlot'>>();
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(EthAddress.random());
    config = {
      ...DefaultSlasherConfig,
      slashDuplicateProposalPenalty: 23n,
    };
    watcher = new CheckpointEquivocationWatcher(l2BlockSource, epochCache, config);
    handler = jest.fn();
    watcher.on(WANT_TO_SLASH_EVENT, handler);
    await watcher.start();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  const emitAndFlush = async (event: CheckpointEquivocationDetectedEvent) => {
    archiverEmitter.emit(L2BlockSourceEvents.CheckpointEquivocationDetected, event);
    // Allow the async handler to settle.
    await new Promise(resolve => setImmediate(resolve));
  };

  it('emits a DUPLICATE_PROPOSAL slash for the slot proposer when divergence is detected', async () => {
    const proposer = EthAddress.random();
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValueOnce(proposer);

    await emitAndFlush(makeEvent());

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer,
        amount: 23n,
        offenseType: OffenseType.DUPLICATE_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('does not emit when there is no proposer for the slot', async () => {
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValueOnce(undefined);

    await emitAndFlush(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('emits a zero-amount offense when the penalty is zero', async () => {
    await watcher.stop();
    const proposer = EthAddress.random();
    config = { ...config, slashDuplicateProposalPenalty: 0n };
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValueOnce(proposer);
    watcher = new CheckpointEquivocationWatcher(l2BlockSource, epochCache, config);
    handler = jest.fn();
    watcher.on(WANT_TO_SLASH_EVENT, handler);
    await watcher.start();

    await emitAndFlush(makeEvent());

    expect(handler).toHaveBeenCalledWith([
      {
        validator: proposer,
        amount: 0n,
        offenseType: OffenseType.DUPLICATE_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('emits separately for distinct slots', async () => {
    const proposer = EthAddress.random();
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer);

    await emitAndFlush(makeEvent({ slotNumber: SlotNumber(10) }));
    await emitAndFlush(makeEvent({ slotNumber: SlotNumber(11) }));

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0][0].epochOrSlot).toBe(10n);
    expect(handler.mock.calls[1][0][0].epochOrSlot).toBe(11n);
  });

  it('does not slash after stop()', async () => {
    await watcher.stop();
    await emitAndFlush(makeEvent());

    expect(handler).not.toHaveBeenCalled();
  });
});
