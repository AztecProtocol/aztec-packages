import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { P2PClient } from '@aztec/stdlib/interfaces/server';
import type { BlockProposal, CheckpointProposalCore } from '@aztec/stdlib/p2p';
import { OffenseType } from '@aztec/stdlib/slashing';
import {
  makeBlockHeader,
  makeBlockProposal,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { DefaultSlasherConfig, type SlasherConfig } from '../config.js';
import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { BroadcastedInvalidCheckpointProposalWatcher } from './broadcasted_invalid_checkpoint_proposal_watcher.js';

describe('BroadcastedInvalidCheckpointProposalWatcher', () => {
  let p2pClient: MockProxy<Pick<P2PClient, 'getProposalsForSlot'>>;
  let l2BlockSource: MockProxy<Pick<L2BlockSource, 'getSyncedL2SlotNumber'>>;
  let epochCache: MockProxy<Pick<EpochCacheInterface, 'getSlotNow' | 'getL1Constants'>>;
  let config: SlasherConfig;
  let watcher: BroadcastedInvalidCheckpointProposalWatcher;
  let handler: jest.MockedFunction<(args: WantToSlashArgs[]) => void>;

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
    config = {
      ...DefaultSlasherConfig,
      slashBroadcastedInvalidCheckpointProposalPenalty: 11n,
    };
    watcher = new BroadcastedInvalidCheckpointProposalWatcher(p2pClient, l2BlockSource, epochCache, config, 4);
    handler = jest.fn();
    watcher.on(WANT_TO_SLASH_EVENT, handler);
  });

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

  const makeCheckpointCore = async (
    signer: Secp256k1Signer,
    slot: SlotNumber,
    terminalBlock: BlockProposal,
    includeLastBlock = false,
  ): Promise<CheckpointProposalCore> => {
    const checkpoint = await makeCheckpointProposal({
      signer,
      checkpointHeader: makeCheckpointHeader(1, { slotNumber: slot }),
      archiveRoot: terminalBlock.archive,
      lastBlock: includeLastBlock
        ? {
            blockHeader: terminalBlock.blockHeader,
            indexWithinCheckpoint: terminalBlock.indexWithinCheckpoint,
            txHashes: terminalBlock.txHashes,
          }
        : undefined,
    });
    return checkpoint.toCore();
  };

  const mockProposals = (
    slot: SlotNumber,
    blockProposals: BlockProposal[],
    checkpointProposals: CheckpointProposalCore[],
  ) =>
    p2pClient.getProposalsForSlot.mockImplementation(querySlot =>
      Promise.resolve(
        querySlot === slot ? { blockProposals, checkpointProposals } : { blockProposals: [], checkpointProposals: [] },
      ),
    );

  it('slashes when higher-index block proposals arrive before a truncated checkpoint proposal', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
    mockProposals(slot, blocks, [checkpoint]);

    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: signer.address,
        amount: 11n,
        offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('slashes when a higher-index proposal arrives after an earlier non-slashing scan', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
    mockProposals(slot, blocks.slice(0, 2), [checkpoint]);

    await watcher.scanSlot(slot);
    expect(handler).not.toHaveBeenCalled();

    mockProposals(slot, blocks, [checkpoint]);
    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0][0].validator).toEqual(signer.address);
  });

  it('infers the terminal proposal from a retained block reconstructed out of embedded lastBlock', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpointWithLastBlock = await makeCheckpointProposal({
      signer,
      checkpointHeader: makeCheckpointHeader(1, { slotNumber: slot }),
      archiveRoot: blocks[1].archive,
      lastBlock: {
        blockHeader: blocks[1].blockHeader,
        indexWithinCheckpoint: blocks[1].indexWithinCheckpoint,
        txHashes: blocks[1].txHashes,
      },
    });
    mockProposals(slot, [checkpointWithLastBlock.getBlockProposal()!, blocks[2]], [checkpointWithLastBlock.toCore()]);

    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0][0].validator).toEqual(signer.address);
  });

  it('does not slash when the checkpoint terminates at the highest known block', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[3]);
    mockProposals(slot, blocks, [checkpoint]);

    await watcher.scanSlot(slot);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not slash without a matching signed terminal block proposal', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const missingTerminal = await makeBlockProposal({
      signer,
      blockHeader: makeBlockHeader(99, { slotNumber: slot }),
      archiveRoot: Fr.random(),
      indexWithinCheckpoint: IndexWithinCheckpoint(1),
    });
    const checkpoint = await makeCheckpointCore(signer, slot, missingTerminal);
    mockProposals(slot, blocks, [checkpoint]);

    await watcher.scanSlot(slot);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not slash when the higher-index block is signed by a different validator', async () => {
    const signer = Secp256k1Signer.random();
    const otherSigner = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 2);
    const higherBlock = (await makeBlocks(otherSigner, slot, 3))[2];
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
    mockProposals(slot, [...blocks, higherBlock], [checkpoint]);

    await watcher.scanSlot(slot);

    expect(handler).not.toHaveBeenCalled();
  });

  it('emits zero-amount offenses when the penalty is zero', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
    watcher.updateConfig({ slashBroadcastedInvalidCheckpointProposalPenalty: 0n });
    mockProposals(slot, blocks, [checkpoint]);

    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledWith([
      {
        validator: signer.address,
        amount: 0n,
        offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 10n,
      },
    ]);
  });

  it('does not emit duplicate offenses on repeated scans', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
    mockProposals(slot, blocks, [checkpoint]);

    await watcher.scanSlot(slot);
    await watcher.scanSlot(slot);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('scans a lookback of closed slots', async () => {
    const signer = Secp256k1Signer.random();
    const slot = SlotNumber(10);
    const blocks = await makeBlocks(signer, slot, 4);
    const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
    mockProposals(slot, blocks, [checkpoint]);

    await watcher.scan();

    expect(p2pClient.getProposalsForSlot).toHaveBeenCalledWith(SlotNumber(7));
    expect(p2pClient.getProposalsForSlot).toHaveBeenCalledWith(SlotNumber(10));
    expect(handler).toHaveBeenCalledTimes(1);
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

  it('falls back to the wallclock when the archiver has not yet synced', async () => {
    p2pClient.getProposalsForSlot.mockResolvedValue({ blockProposals: [], checkpointProposals: [] });
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(undefined);
    epochCache.getSlotNow.mockReturnValue(SlotNumber(12));

    await watcher.scan();

    expect(p2pClient.getProposalsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(7),
      SlotNumber(8),
      SlotNumber(9),
      SlotNumber(10),
    ]);
  });

  it('does not expand the scan window when L1 stalls but wallclock keeps moving', async () => {
    p2pClient.getProposalsForSlot.mockResolvedValue({ blockProposals: [], checkpointProposals: [] });
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(12));
    epochCache.getSlotNow.mockReturnValue(SlotNumber(12));

    await watcher.scan();
    p2pClient.getProposalsForSlot.mockClear();
    epochCache.getSlotNow.mockReturnValue(SlotNumber(50));

    await watcher.scan();

    expect(p2pClient.getProposalsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(7),
      SlotNumber(8),
      SlotNumber(9),
      SlotNumber(10),
    ]);
  });

  it('only expands beyond the lookback for newly closed slots', async () => {
    p2pClient.getProposalsForSlot.mockResolvedValue({ blockProposals: [], checkpointProposals: [] });

    await watcher.scan();
    p2pClient.getProposalsForSlot.mockClear();
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(13));

    await watcher.scan();

    expect(p2pClient.getProposalsForSlot.mock.calls.map(([slot]) => slot)).toEqual([
      SlotNumber(8),
      SlotNumber(9),
      SlotNumber(10),
      SlotNumber(11),
    ]);
  });

  describe('oversized checkpoint detection', () => {
    const makeWatcherWithMax = (maxBlocksPerCheckpoint: number | undefined) => {
      const w = new BroadcastedInvalidCheckpointProposalWatcher(
        p2pClient,
        l2BlockSource,
        epochCache,
        { ...config, maxBlocksPerCheckpoint },
        4,
      );
      const oversizedHandler = jest.fn();
      w.on(WANT_TO_SLASH_EVENT, oversizedHandler);
      return { watcher: w, handler: oversizedHandler };
    };

    it('flags the signer of a block proposal at the consensus cap with offense 11, even without a checkpoint', async () => {
      const signer = Secp256k1Signer.random();
      const slot = SlotNumber(10);
      // maxBlocksPerCheckpoint = 5, so a block at index 5 (the 6th block) is over the consensus limit.
      const blocks = await makeBlocks(signer, slot, 6);
      mockProposals(slot, blocks, []);

      const { watcher: oversizedWatcher, handler: oversizedHandler } = makeWatcherWithMax(5);
      await oversizedWatcher.scanSlot(slot);

      expect(oversizedHandler).toHaveBeenCalledWith([
        {
          validator: signer.address,
          amount: 11n,
          offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: 10n,
        },
      ]);
    });

    it('does not flag a signer whose block proposals stay within the consensus cap', async () => {
      const signer = Secp256k1Signer.random();
      const slot = SlotNumber(10);
      const blocks = await makeBlocks(signer, slot, 5);
      mockProposals(slot, blocks, []);

      const { watcher: oversizedWatcher, handler: oversizedHandler } = makeWatcherWithMax(5);
      await oversizedWatcher.scanSlot(slot);

      expect(oversizedHandler).not.toHaveBeenCalled();
    });

    it('does not flag oversized proposals when maxBlocksPerCheckpoint is undefined', async () => {
      const signer = Secp256k1Signer.random();
      const slot = SlotNumber(10);
      const blocks = await makeBlocks(signer, slot, 6);
      mockProposals(slot, blocks, []);

      const { watcher: oversizedWatcher, handler: oversizedHandler } = makeWatcherWithMax(undefined);
      await oversizedWatcher.scanSlot(slot);

      expect(oversizedHandler).not.toHaveBeenCalled();
    });

    it('dedups a truncated and oversized offense for the same proposer/slot into one offense', async () => {
      const signer = Secp256k1Signer.random();
      const slot = SlotNumber(10);
      // 6 blocks (indices 0..5) with maxBlocksPerCheckpoint = 5: index 5 is oversized. A checkpoint
      // terminating at block index 1 is also truncated (higher-index blocks exist). Both checks flag the
      // same signer; the dedup key collapses them to a single emitted offense.
      const blocks = await makeBlocks(signer, slot, 6);
      const checkpoint = await makeCheckpointCore(signer, slot, blocks[1]);
      mockProposals(slot, blocks, [checkpoint]);

      const { watcher: oversizedWatcher, handler: oversizedHandler } = makeWatcherWithMax(5);
      await oversizedWatcher.scanSlot(slot);

      expect(oversizedHandler).toHaveBeenCalledTimes(1);
      expect(oversizedHandler.mock.calls[0][0]).toEqual([
        {
          validator: signer.address,
          amount: 11n,
          offenseType: OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL,
          epochOrSlot: 10n,
        },
      ]);
    });
  });
});
