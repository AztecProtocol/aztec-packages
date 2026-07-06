import type { EpochCache } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { CheckpointReexecutionTracker, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { CoordinationSignatureContext } from '@aztec/stdlib/consensus';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { ITxProvider, P2PApi } from '@aztec/stdlib/interfaces/server';
import { OffenseType } from '@aztec/stdlib/slashing';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { WANT_TO_SLASH_EVENT, type WantToSlashArgs } from '../watcher.js';
import { DataWithholdingWatcher } from './data_withholding_watcher.js';

class TestDataWithholdingWatcher extends DataWithholdingWatcher {
  public attestersBySlot = new Map<number, EthAddress[]>();

  protected override extractAttesters(published: PublishedCheckpoint): Promise<EthAddress[]> {
    return Promise.resolve(this.attestersBySlot.get(published.checkpoint.header.slotNumber) ?? []);
  }
}

describe('DataWithholdingWatcher', () => {
  const TOLERANCE = 3;
  const PENALTY = 1_000_000_000_000_000_000n;
  const signatureContext: CoordinationSignatureContext = {
    chainId: 31337,
    rollupAddress: EthAddress.fromNumber(1),
  };

  let epochCache: MockProxy<EpochCache>;
  let l2BlockSource: MockProxy<Pick<L2BlockSource, 'getCheckpoint' | 'getSyncedL2SlotNumber'>>;
  let txProvider: MockProxy<Pick<ITxProvider, 'hasTxs'>>;
  let p2p: MockProxy<Pick<P2PApi, 'getCheckpointAttestationsForSlot'>>;
  let reexecutionTracker: MockProxy<Pick<CheckpointReexecutionTracker, 'getTxsCollectedRecord'>>;
  let watcher: TestDataWithholdingWatcher;
  let l1Constants: L1RollupConstants;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    l2BlockSource = mock<Pick<L2BlockSource, 'getCheckpoint' | 'getSyncedL2SlotNumber'>>();
    txProvider = mock<Pick<ITxProvider, 'hasTxs'>>();
    p2p = mock<Pick<P2PApi, 'getCheckpointAttestationsForSlot'>>();
    p2p.getCheckpointAttestationsForSlot.mockResolvedValue([]);
    reexecutionTracker = mock<Pick<CheckpointReexecutionTracker, 'getTxsCollectedRecord'>>();
    reexecutionTracker.getTxsCollectedRecord.mockReturnValue(undefined);

    l1Constants = {
      l1StartBlock: 1n,
      l1GenesisTime: 1_700_000_000n,
      slotDuration: 24,
      epochDuration: 8,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };
    epochCache.getL1Constants.mockReturnValue(l1Constants);

    watcher = new TestDataWithholdingWatcher(
      epochCache as EpochCache,
      l2BlockSource,
      txProvider,
      p2p,
      reexecutionTracker,
      signatureContext,
      {
        slashDataWithholdingPenalty: PENALTY,
        slashDataWithholdingToleranceSlots: TOLERANCE,
      },
    );
  });

  afterEach(async () => {
    await watcher.stop();
  });

  /**
   * Builds a minimal published-checkpoint shape carrying just the fields the watcher reads:
   * `checkpoint.{header.slotNumber, number, archive.root, blocks[*].{header.getSlot, body.txEffects[*].txHash}}`.
   * Each block's header.getSlot() returns the checkpoint's slot (single-block-per-checkpoint test default).
   */
  const makePublished = (slot: number, txCount: number, blockCount = 1): PublishedCheckpoint => {
    const blocks = Array.from({ length: blockCount }, () => ({
      header: { getSlot: () => SlotNumber(slot) },
      body: { txEffects: Array.from({ length: txCount }, () => ({ txHash: TxHash.random() })) },
    }));
    return {
      checkpoint: {
        header: { slotNumber: SlotNumber(slot) },
        number: slot,
        archive: { root: { toString: () => `archive-${slot}` } },
        blocks,
      },
    } as unknown as PublishedCheckpoint;
  };

  /** Configures the synced-slot fallback used by start() and seeds initial slot. */
  const startAtSlot = async (initialSlot: number) => {
    l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(initialSlot));
    await watcher.start();
  };

  /** Sets the watcher's "current slot" as seen by `work()` (via the archiver's synced slot). */
  const setSyncedSlot = (slot: number) => l2BlockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(slot));

  /** Captures emitted slash args. */
  const captureEmits = (): WantToSlashArgs[][] => {
    const captured: WantToSlashArgs[][] = [];
    watcher.on(WANT_TO_SLASH_EVENT, args => captured.push(args));
    return captured;
  };

  /** Mocks `hasTxs` so the given hashes report as missing and all others as present. */
  const mockMissing = (missingHashes: TxHash[]) => {
    const missingSet = new Set(missingHashes.map(h => h.toString()));
    txProvider.hasTxs.mockImplementation((hashes: TxHash[]) =>
      Promise.resolve(hashes.map(h => !missingSet.has(h.toString()))),
    );
  };

  it('does nothing on a tick before tolerance has elapsed', async () => {
    await startAtSlot(0);
    setSyncedSlot(TOLERANCE - 1);
    const captured = captureEmits();

    await watcher.work();

    expect(l2BlockSource.getCheckpoint).not.toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it('does not look back before its initial slot', async () => {
    await startAtSlot(100);
    setSyncedSlot(100 + TOLERANCE);
    const captured = captureEmits();

    await watcher.work();

    expect(l2BlockSource.getCheckpoint).not.toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it('skips slots with no published checkpoint', async () => {
    await startAtSlot(10);
    setSyncedSlot(17);
    l2BlockSource.getCheckpoint.mockResolvedValue(undefined);
    const captured = captureEmits();

    await watcher.work();

    expect(l2BlockSource.getCheckpoint).toHaveBeenCalledWith({ slot: SlotNumber(11) });
    expect(l2BlockSource.getCheckpoint).toHaveBeenCalledWith({ slot: SlotNumber(12) });
    expect(l2BlockSource.getCheckpoint).toHaveBeenCalledWith({ slot: SlotNumber(13) });
    expect(captured).toHaveLength(0);
  });

  it('does not slash when all block proposals report collected=true (skips mempool probe)', async () => {
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 2);
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    reexecutionTracker.getTxsCollectedRecord.mockReturnValue(true);
    watcher.attestersBySlot.set(slot, [EthAddress.random(), EthAddress.random()]);
    const captured = captureEmits();

    await watcher.work();

    expect(txProvider.hasTxs).not.toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it('falls back to mempool probe when some blocks have collected=false (DW tolerance may permit late arrivals)', async () => {
    // A `false` record means we missed the re-execution deadline, but the DW tolerance window
    // gives more time for txs to propagate. The watcher must consult the mempool to decide.
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 2, 2);
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    reexecutionTracker.getTxsCollectedRecord.mockImplementation((_s, idx) => (idx === 0 ? true : false));

    // Mempool now reports both txs as available — late arrival saves the proposer.
    mockMissing([]);
    watcher.attestersBySlot.set(slot, [EthAddress.random()]);
    const captured = captureEmits();

    await watcher.work();

    expect(txProvider.hasTxs).toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it('falls back to mempool probe when records are partial (some undefined, no false)', async () => {
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 1, 2);
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    reexecutionTracker.getTxsCollectedRecord.mockImplementation((_s, idx) => (idx === 0 ? true : undefined));

    const missing = published.checkpoint.blocks[1].body.txEffects[0].txHash;
    mockMissing([missing]);
    const attester = EthAddress.random();
    watcher.attestersBySlot.set(slot, [attester]);
    const captured = captureEmits();

    await watcher.work();

    expect(txProvider.hasTxs).toHaveBeenCalled();
    expect(captured).toHaveLength(1);
    expect(captured[0][0].offenseType).toBe(OffenseType.DATA_WITHHOLDING);
  });

  it('does not slash on partial records when mempool probe finds all txs available', async () => {
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 2);
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    reexecutionTracker.getTxsCollectedRecord.mockReturnValue(undefined);
    mockMissing([]);
    watcher.attestersBySlot.set(slot, [EthAddress.random()]);
    const captured = captureEmits();

    await watcher.work();

    expect(txProvider.hasTxs).toHaveBeenCalled();
    expect(captured).toHaveLength(0);
  });

  it('emits a slash for the per-checkpoint attesters when mempool probe reports missing', async () => {
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 3);
    const missingHash = published.checkpoint.blocks[0].body.txEffects[0].txHash;
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    mockMissing([missingHash]);

    const attesterA = EthAddress.random();
    const attesterB = EthAddress.random();
    watcher.attestersBySlot.set(slot, [attesterA, attesterB]);

    const captured = captureEmits();

    await watcher.work();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual([
      {
        validator: attesterA,
        amount: PENALTY,
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: BigInt(slot),
      },
      {
        validator: attesterB,
        amount: PENALTY,
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: BigInt(slot),
      },
    ]);
  });

  it('does not re-emit for the same slot on subsequent ticks', async () => {
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 1);
    const missing = published.checkpoint.blocks[0].body.txEffects[0].txHash;
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    mockMissing([missing]);
    watcher.attestersBySlot.set(slot, [EthAddress.random()]);
    const captured = captureEmits();

    await watcher.work();
    expect(captured).toHaveLength(1);

    await watcher.work();
    expect(captured).toHaveLength(1);
    expect(l2BlockSource.getCheckpoint).toHaveBeenCalledTimes(1);
  });

  it('emits zero-amount offenses when the penalty is zero', async () => {
    watcher.updateConfig({ slashDataWithholdingPenalty: 0n });
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 1);
    const missing = published.checkpoint.blocks[0].body.txEffects[0].txHash;
    const attester = EthAddress.random();
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    mockMissing([missing]);
    watcher.attestersBySlot.set(slot, [attester]);

    const captured = captureEmits();
    await watcher.work();

    expect(captured).toEqual([
      [
        {
          validator: attester,
          amount: 0n,
          offenseType: OffenseType.DATA_WITHHOLDING,
          epochOrSlot: BigInt(slot),
        },
      ],
    ]);
  });

  it('does not slash a checkpoint with no recoverable attesters even if txs are missing', async () => {
    await startAtSlot(10);
    setSyncedSlot(11 + TOLERANCE + 1);

    const slot = 11;
    const published = makePublished(slot, 1);
    const missing = published.checkpoint.blocks[0].body.txEffects[0].txHash;
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    mockMissing([missing]);
    watcher.attestersBySlot.set(slot, []);
    const captured = captureEmits();

    await watcher.work();

    expect(captured).toHaveLength(0);
  });

  it('sets epochOrSlot to the checkpoint slot, not its epoch (slot-keyed offense)', async () => {
    await startAtSlot(0);
    setSyncedSlot(1 + TOLERANCE + 1);

    const slot = 1;
    const published = makePublished(slot, 1);
    const missing = published.checkpoint.blocks[0].body.txEffects[0].txHash satisfies TxHash;
    l2BlockSource.getCheckpoint.mockResolvedValue(published);
    mockMissing([missing]);
    watcher.attestersBySlot.set(slot, [EthAddress.random()]);
    const captured = captureEmits();

    await watcher.work();

    expect(captured).toHaveLength(1);
    expect(captured[0][0].epochOrSlot).toEqual(BigInt(slot));
  });
});
