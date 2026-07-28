import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import type { ChonkCache } from '@aztec/prover-client/orchestrator';
import type { PublicProcessorFactory } from '@aztec/simulator/server';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { ForkMerkleTreeOperations, ITxProvider } from '@aztec/stdlib/interfaces/server';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import { SessionManager } from '../session-manager.js';
import { CheckpointProver, type CheckpointProverArgs, type CheckpointProverDeps } from './checkpoint-prover.js';

describe('CheckpointProver', () => {
  let checkpoint: Checkpoint;
  let deps: CheckpointProverDeps;
  let txProvider: ReturnType<typeof mock<ITxProvider>>;
  let proverFactory: ReturnType<typeof mock<EpochProverFactory>>;
  let publicProcessorFactory: ReturnType<typeof mock<PublicProcessorFactory>>;
  let dbProvider: ReturnType<typeof mock<Pick<ForkMerkleTreeOperations, 'fork'>>>;
  let chonkCache: ReturnType<typeof mock<ChonkCache>>;
  let onFailed: jest.Mock<(prover: CheckpointProver) => void>;
  let log: Logger;

  beforeEach(async () => {
    checkpoint = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2 });

    txProvider = mock<ITxProvider>();
    proverFactory = mock<EpochProverFactory>();
    publicProcessorFactory = mock<PublicProcessorFactory>();
    dbProvider = mock<Pick<ForkMerkleTreeOperations, 'fork'>>();
    chonkCache = mock<ChonkCache>();
    onFailed = jest.fn<(prover: CheckpointProver) => void>();
    log = createLogger('test:checkpoint-prover');

    // Default: gather rejects fast so the eager pipeline unwinds without hanging. The
    // production prover doesn't propagate abort into the txProvider call (only a deadline)
    // — a never-resolving mock would leave runPromise pending forever even after cancel,
    // which would in turn hang whenDone(). Per-test overrides reconfigure the mock when a
    // specific failure mode is under test.
    txProvider.getTxsForBlock.mockRejectedValue(new Error('test default: gather not configured'));

    deps = {
      proverFactory,
      chonkCache,
      publicProcessorFactory,
      dbProvider,
      txProvider,
      dateProvider: new DateProvider(),
      proverId: EthAddress.ZERO,
      metrics: new ProverNodeJobMetrics(
        { createHistogram: noopMetric, createGauge: noopMetric, createCounter: noopMetric } as any,
        { startActiveSpan: (_n: string, fn: any) => fn({ end: () => {} }) } as any,
      ),
      txGatheringTimeoutMs: 30_000,
      deadline: undefined,
      onFailed,
      log,
    };
  });

  // ---------------- identity ----------------

  describe('idFor', () => {
    it('formats id as `${checkpointNumber}:${slot}:${archiveRoot}`', () => {
      const id = CheckpointProver.idFor(checkpoint);
      expect(id).toBe(`${checkpoint.number}:${checkpoint.header.slotNumber}:${checkpoint.archive.root.toString()}`);
    });

    it('two checkpoints with the same content key produce the same id', async () => {
      // Same archive root + slot + number ⇒ same id, even if other fields differ.
      const a = checkpoint;
      const b = await Checkpoint.random(a.number, {
        numBlocks: 1,
        slotNumber: a.header.slotNumber,
        archive: a.archive,
      });
      expect(CheckpointProver.idFor(a)).toBe(CheckpointProver.idFor(b));
    });
  });

  // ---------------- construction ----------------

  describe('construction', () => {
    it('initializes readonly fields from args', async () => {
      const prover = makeProver();
      expect(prover.id).toBe(CheckpointProver.idFor(checkpoint));
      expect(prover.checkpoint).toBe(checkpoint);
      expect(prover.epochNumber).toEqual(EpochNumber(5));
      expect(prover.slotNumber).toEqual(checkpoint.header.slotNumber);
      expect(prover.attestations).toEqual([]);
      expect(prover.l1ToL2Messages).toEqual([]);
      expect(prover.isCancelled()).toBe(false);
      expect(prover.isFailed()).toBe(false);
      await cleanup(prover);
    });

    it('eagerly starts tx gathering on construction', async () => {
      const prover = makeProver();
      // The constructor kicks off gatherTxs which calls getTxsForBlock for every block.
      expect(txProvider.getTxsForBlock).toHaveBeenCalledTimes(checkpoint.blocks.length);
      await cleanup(prover);
    });
  });

  // ---------------- cancellation ----------------

  describe('cancel', () => {
    it('flips isCancelled() and fires the abort signal', async () => {
      const prover = makeProver();
      expect(prover.isCancelled()).toBe(false);
      expect(prover.getAbortSignal().aborted).toBe(false);

      prover.cancel();
      expect(prover.isCancelled()).toBe(true);
      expect(prover.getAbortSignal().aborted).toBe(true);
      await prover.whenDone();
    });

    it('is idempotent', async () => {
      const prover = makeProver();
      prover.cancel();
      // Second call is a no-op — no throws, no extra side effects.
      prover.cancel();
      expect(prover.isCancelled()).toBe(true);
      await prover.whenDone();
    });

    it('rejects whenBlockProofsReady() but does not mark the prover failed or fire onFailed', async () => {
      // A cancel (reorg/prune/shutdown) is not a proving failure: isFailed() must stay false and the
      // onFailed callback must not fire (no post-mortem upload for a cancelled prover).
      const prover = makeProver();
      const blockProofs = prover.whenBlockProofsReady();
      prover.cancel();
      await expect(blockProofs).rejects.toThrow(/cancelled/);
      expect(prover.isFailed()).toBe(false);
      expect(onFailed).not.toHaveBeenCalled();
      await prover.whenDone();
    });

    it('whenDone resolves after cancel unwinds even when gather is still in flight', async () => {
      // Hold gather pending until after cancel fires — gatherAndExecute's `cancelled`
      // guard must swallow the resulting rejection so runPromise still resolves cleanly.
      const gate = promiseWithResolvers<{ txs: Tx[]; missingTxs: never[] }>();
      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockReturnValue(gate.promise);

      const prover = makeProver();
      prover.cancel();
      gate.reject(new Error('gather aborted by test'));
      await expect(prover.whenDone()).resolves.toBeUndefined();
    });

    it('routine cancel still aborts and rejects block proofs (only log level differs)', async () => {
      const prover = makeProver();
      const blockProofs = prover.whenBlockProofsReady();
      prover.cancel({ routine: true });
      expect(prover.isCancelled()).toBe(true);
      expect(prover.getAbortSignal().aborted).toBe(true);
      await expect(blockProofs).rejects.toThrow(/cancelled/);
      await prover.whenDone();
    });
  });

  // ---------------- cancellation short-circuits execution ----------------

  describe('cancellation short-circuits execution', () => {
    it('threads its abort signal into public execution so a cancel stops the current block', async () => {
      // Drive execution into the block loop: gather resolves, the sub-tree and forks are stubbed,
      // and public processing parks until its signal aborts. The captured signal must be the
      // prover's own abort signal, so cancelling the prover interrupts the in-flight block rather
      // than letting it run to completion before the next `signal.aborted` check.
      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockResolvedValue({ txs: [], missingTxs: [] });

      const subTree = {
        getSubTreeResult: () => new Promise<never>(() => {}),
        startNewBlock: () => Promise.resolve(),
        startChonkVerifierCircuits: () => Promise.resolve(),
        addTxs: () => Promise.resolve(),
        setBlockCompleted: () => Promise.resolve(),
        cancel: () => {},
        stop: () => Promise.resolve(),
      };
      proverFactory.createCheckpointSubTreeOrchestrator.mockResolvedValue(subTree as any);
      dbProvider.fork.mockResolvedValue({
        appendLeaves: () => Promise.resolve(),
        close: () => Promise.resolve(),
      } as any);

      const processReached = promiseWithResolvers<AbortSignal>();
      const publicProcessor = {
        process: (_txs: unknown, limits: { signal?: AbortSignal }) => {
          processReached.resolve(limits.signal!);
          // Park until the signal aborts, mirroring PublicProcessor's per-tx abort check.
          return new Promise(resolve => {
            limits.signal?.addEventListener('abort', () => resolve([[], [], [], [], []]));
          });
        },
      };
      publicProcessorFactory.create.mockReturnValue(publicProcessor as any);

      const prover = makeProver();
      const signal = await processReached.promise;
      expect(signal.aborted).toBe(false);

      prover.cancel();
      expect(signal.aborted).toBe(true);
      await expect(prover.whenDone()).resolves.toBeUndefined();
    });
  });

  // ---------------- gather failure ----------------

  describe('gather failures', () => {
    it('rejects whenBlockProofsReady when txProvider returns missing txs', async () => {
      const missingHash = checkpoint.blocks[0].body.txEffects[0]?.txHash;
      // Without a real missing hash the per-block payload would be empty and the prover
      // would happily proceed; only checkpoints with txs can exercise this branch.
      if (!missingHash) {
        return;
      }
      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockResolvedValue({ txs: [], missingTxs: [missingHash] });

      const prover = makeProver();
      await expect(prover.whenBlockProofsReady()).rejects.toThrow(/Txs not found/);
      await prover.whenDone();
    });

    it('does not surface an error when cancel races ahead of gather', async () => {
      // Hold gather pending until after cancel — the cancelled guard in gatherAndExecute
      // swallows the abort-induced rejection silently; no unhandled rejection should
      // escape whenDone().
      const gate = promiseWithResolvers<{ txs: Tx[]; missingTxs: never[] }>();
      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockReturnValue(gate.promise);

      const prover = makeProver();
      const blockProofs = prover.whenBlockProofsReady();
      prover.cancel();
      gate.reject(new Error('gather aborted by test'));
      await expect(blockProofs).rejects.toThrow(/cancelled/);
      await expect(prover.whenDone()).resolves.toBeUndefined();
    });

    it('lets a second whenBlockProofsReady caller observe the same rejection', async () => {
      // Two callers awaiting the same promise both see the rejection — neither leaks an
      // unhandled rejection (the constructor pre-attaches a noop catch handler).
      const prover = makeProver();
      const a = prover.whenBlockProofsReady();
      const b = prover.whenBlockProofsReady();
      prover.cancel();
      await Promise.all([expect(a).rejects.toThrow(/cancelled/), expect(b).rejects.toThrow(/cancelled/)]);
      await prover.whenDone();
    });

    it('cancel after a gather-failure rejection is still idempotent', async () => {
      const missingHash = checkpoint.blocks[0].body.txEffects[0]?.txHash;
      if (!missingHash) {
        return;
      }
      const failure = promiseWithResolvers<{ txs: Tx[]; missingTxs: (typeof missingHash)[] }>();
      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockReturnValue(failure.promise);

      const prover = makeProver();
      failure.resolve({ txs: [], missingTxs: [missingHash] });
      await expect(prover.whenBlockProofsReady()).rejects.toThrow(/Txs not found/);
      // Subsequent cancel is a no-op; no throws.
      prover.cancel();
      expect(prover.isCancelled()).toBe(true);
      await prover.whenDone();
    });
  });

  // ---------------- data-plane reorg fork fault ----------------

  describe('data-plane reorg fault', () => {
    it('rejects whenBlockProofsReady when a world-state fork faults mid-proof', async () => {
      // Models the data-plane prune race: gather succeeds and the sub-tree starts, but the
      // world-state synchronizer has already unwound the base block, so forking it faults inside
      // executeCheckpoint. The fault must reject whenBlockProofsReady() AND mark the prover failed, so
      // the SessionManager won't build (or rebuild) an EpochSession over it until a re-add replaces it.
      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockResolvedValue({ txs: [], missingTxs: [] });

      const subTree = {
        getSubTreeResult: () => new Promise<never>(() => {}),
        startNewBlock: () => Promise.resolve(),
        startChonkVerifierCircuits: () => Promise.resolve(),
        addTxs: () => Promise.resolve(),
        setBlockCompleted: () => Promise.resolve(),
        cancel: () => {},
        stop: () => Promise.resolve(),
      };
      proverFactory.createCheckpointSubTreeOrchestrator.mockResolvedValue(subTree as any);

      // The prune-induced fault: the base block was unwound, so forking it rejects. This is the
      // production signal — `Unable to get meta data for block N` out of world-state.
      dbProvider.fork.mockRejectedValue(new Error('Unable to get meta data for block 0'));

      const prover = makeProver();

      // blockProofs rejects: the fork error aborts the block loop before completion, so the sub-tree
      // never yields proofs. (The raw fork error is logged; the promise settles as not-completed.)
      await expect(prover.whenBlockProofsReady()).rejects.toThrow(/did not complete block processing/);
      expect(dbProvider.fork).toHaveBeenCalled();
      expect(prover.isFailed()).toBe(true);
      // The owner is notified exactly once, with this prover, so it can upload a checkpoint post-mortem.
      expect(onFailed).toHaveBeenCalledTimes(1);
      expect(onFailed).toHaveBeenCalledWith(prover);

      await cleanup(prover);
    });
  });

  // ---------------- tx re-fetch for failure upload ----------------

  describe('getTxsForUpload', () => {
    // A minimal Tx stand-in: getTxsForUpload only keys the map by getTxHash().toString().
    const fakeTx = (hash: string) => ({ getTxHash: () => ({ toString: () => hash }) }) as unknown as Tx;

    it('re-fetches txs from the pool on demand (the prover caches nothing)', async () => {
      // The prover holds no tx map — the pool is the source of truth. Let the eager gather fail so the
      // pipeline unwinds, then reconfigure the pool and re-fetch, mirroring a post-failure upload.
      const prover = makeProver();
      await prover.whenBlockProofsReady().catch(() => {});

      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockResolvedValue({ txs: [fakeTx('0xaa'), fakeTx('0xbb')], missingTxs: [] });

      const uploaded = await prover.getTxsForUpload();
      // One fetch per block; returns the pool's txs keyed by hash.
      expect(txProvider.getTxsForBlock).toHaveBeenCalledTimes(checkpoint.blocks.length);
      expect(uploaded.get('0xaa')).toBeDefined();
      expect(uploaded.get('0xbb')).toBeDefined();

      await cleanup(prover);
    });

    it('failure-upload re-fetches from the pool and builds complete EpochProvingJobData', async () => {
      const prover = makeProver();
      await prover.whenBlockProofsReady().catch(() => {});

      txProvider.getTxsForBlock.mockReset();
      txProvider.getTxsForBlock.mockResolvedValue({ txs: [fakeTx('0xaa')], missingTxs: [] });

      const data = await SessionManager.buildProvingData([prover]);
      expect(data.txs.get('0xaa')).toBeDefined();
      expect(data.checkpoints).toEqual([checkpoint]);
      expect(data.epochNumber).toEqual(prover.epochNumber);

      await cleanup(prover);
    });
  });

  // ---------------- helpers ----------------

  function makeProver(overrides: Partial<CheckpointProverArgs> = {}): CheckpointProver {
    const args: CheckpointProverArgs = {
      checkpoint,
      epochNumber: EpochNumber(5),
      attestations: [],
      previousBlockHeader: {} as BlockHeader,
      l1ToL2Messages: [],
      previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
      ...overrides,
    };
    return new CheckpointProver(args, deps);
  }

  async function cleanup(prover: CheckpointProver): Promise<void> {
    if (!prover.isCancelled()) {
      prover.cancel({ routine: true });
    }
    await prover.whenDone();
  }
});

/** Minimal Histogram/Gauge/Counter stub: only the methods ProverNodeJobMetrics records into. */
function noopMetric() {
  return { record: () => {}, add: () => {} };
}
