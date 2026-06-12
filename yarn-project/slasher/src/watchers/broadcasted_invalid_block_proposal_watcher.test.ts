import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { P2PClient } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal } from '@aztec/stdlib/p2p';
import { OffenseType } from '@aztec/stdlib/slashing';
import { makeBlockHeader, makeBlockProposal } from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { DefaultSlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { BroadcastedInvalidBlockProposalWatcher } from './broadcasted_invalid_block_proposal_watcher.js';

describe('BroadcastedInvalidBlockProposalWatcher', () => {
  let p2pClient: MockProxy<Pick<P2PClient, 'getProposalsForSlot'>>;
  let l2BlockSource: MockProxy<Pick<L2BlockSource, 'getSyncedL2SlotNumber'>>;
  let epochCache: MockProxy<Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>>;
  let watcher: BroadcastedInvalidBlockProposalWatcher;
  let handler: jest.MockedFunction<(args: WantToSlashArgs[]) => void>;

  const MAX_BLOCKS = 5;

  beforeEach(() => {
    p2pClient = mock<Pick<P2PClient, 'getProposalsForSlot'>>();
    l2BlockSource = mock<Pick<L2BlockSource, 'getSyncedL2SlotNumber'>>();
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(12));
    epochCache = mock<Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>>();
    epochCache.getSlotNow.mockReturnValue(SlotNumber(12));
    epochCache.getL1Constants.mockReturnValue({
      ...EmptyL1RollupConstants,
      epochDuration: 8,
      ethereumSlotDuration: 12,
    });
    watcher = makeWatcher(MAX_BLOCKS);
    handler = jest.fn();
    watcher.on(WANT_TO_SLASH_EVENT, handler);
  });

  const makeWatcher = (maxBlocksPerCheckpoint: number | undefined) =>
    new BroadcastedInvalidBlockProposalWatcher(
      p2pClient,
      l2BlockSource,
      epochCache,
      { ...DefaultSlasherConfig, slashBroadcastedInvalidBlockPenalty: 4n, maxBlocksPerCheckpoint },
      4,
    );

  const makeBlocks = async (signer: Secp256k1Signer, slot: SlotNumber, count: number): Promise<BlockProposal[]> =>
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        makeBlockProposal({
          signer,
          blockHeader: makeBlockHeader(index + 1, { slotNumber: slot }),
          archiveRoot: Fr.random(),
          indexWithinCheckpoint: IndexWithinCheckpoint(index),
        }),
      ),
    );

  const mockProposals = (slot: SlotNumber, blockProposals: BlockProposal[]) =>
    p2pClient.getProposalsForSlot.mockImplementation(querySlot =>
      Promise.resolve(
        querySlot === slot
          ? { blockProposals, checkpointProposals: [] }
          : { blockProposals: [], checkpointProposals: [] },
      ),
    );

  it('flags the signer of a block proposal at or beyond the consensus cap, with no checkpoint proposal present', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    // maxBlocksPerCheckpoint = 5, so a block at index 5 (the 6th block) is over the consensus limit.
    const blocks = await makeBlocks(signer, slot, 6);
    mockProposals(slot, blocks);

    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: signer.address,
        amount: 4n,
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('does not flag a signer whose block proposals stay within the consensus cap', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, MAX_BLOCKS);
    mockProposals(slot, blocks);

    await watcher.scanSlot(slot);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not flag oversized proposals when maxBlocksPerCheckpoint is undefined', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 6);
    mockProposals(slot, blocks);

    const unconfiguredWatcher = makeWatcher(undefined);
    const unconfiguredHandler = jest.fn();
    unconfiguredWatcher.on(WANT_TO_SLASH_EVENT, unconfiguredHandler);
    await unconfiguredWatcher.scanSlot(slot);

    expect(unconfiguredHandler).not.toHaveBeenCalled();
  });

  it('emits a single offense per proposer and slot across rescans and multiple oversized proposals', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    // Indices 5 and 6 are both over the limit, but dedup to one offense for the (proposer, slot).
    const blocks = await makeBlocks(signer, slot, 7);
    mockProposals(slot, blocks);

    await watcher.scanSlot(slot);
    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('detects an oversized proposal arriving after an earlier non-slashing scan of the slot', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 6);
    mockProposals(slot, blocks.slice(0, MAX_BLOCKS));

    await watcher.scanSlot(slot);
    expect(handler).not.toHaveBeenCalled();

    mockProposals(slot, blocks);
    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0][0].validator).toEqual(signer.address);
  });

  it('anchors the scan at the archiver synced L2 slot, not the wallclock', async () => {
    p2pClient.getProposalsForSlot.mockResolvedValue({ blockProposals: [], checkpointProposals: [] });
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(9));
    epochCache.getSlotNow.mockReturnValue(SlotNumber(20));

    await watcher.scan();

    expect(p2pClient.getProposalsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(4),
      SlotNumber(5),
      SlotNumber(6),
      SlotNumber(7),
    ]);
  });
});
