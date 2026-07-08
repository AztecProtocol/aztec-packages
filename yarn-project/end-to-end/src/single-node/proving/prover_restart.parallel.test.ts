import type { Logger } from '@aztec/aztec.js/log';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { type ProvingBroker, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import type { TestProverNode } from '@aztec/prover-node/test';
import { EthAddress } from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type {
  AztecNode,
  GetProvingJobResponse,
  ProofUri,
  ProvingJob,
  ProvingJobBroker,
  ProvingJobFilter,
  ProvingJobId,
  ProvingJobStatus,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { expect, jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { NO_REORG_SUBMISSION_EPOCHS, setupWithProver } from '../setup.js';
import { FAST_REORG_TIMING, SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

const isParity = (type: ProvingRequestType) =>
  type === ProvingRequestType.PARITY_BASE || type === ProvingRequestType.PARITY_ROOT;

const isTxBaseRollup = (type: ProvingRequestType) =>
  type === ProvingRequestType.PRIVATE_TX_BASE_ROLLUP || type === ProvingRequestType.PUBLIC_TX_BASE_ROLLUP;

/**
 * A thin proxy over a real {@link ProvingBroker} that (a) records every job enqueue and cancel so the
 * test can assert what the prover node did, and (b) can starve agents on demand so proving jobs pile
 * up unproven at the broker. It deliberately has no `stop()` method, so the prover node's shutdown
 * (`tryStop` on its job producer) does not stop the underlying broker — the broker outlives the node
 * and carries the in-flight jobs across a restart, exactly like a production external broker service.
 */
class RecordingBrokerProxy implements ProvingJobBroker {
  /** When true, agents get no work (getProvingJob returns undefined) and the piggybacked next job on a report is withheld. */
  public agentsPaused = false;
  /** Every job passed to enqueueProvingJob, with the status the broker returned at the start of that call. */
  public readonly enqueues: { job: ProvingJob; returnedStatus: ProvingJobStatus['status'] }[] = [];
  /** Every job id passed to cancelProvingJob. On a clean shutdown this must stay empty. */
  public readonly cancels: ProvingJobId[] = [];

  constructor(private readonly inner: ProvingBroker) {}

  async enqueueProvingJob(job: ProvingJob): Promise<ProvingJobStatus> {
    const status = await this.inner.enqueueProvingJob(job);
    this.enqueues.push({ job, returnedStatus: status.status });
    return status;
  }

  cancelProvingJob(id: ProvingJobId): Promise<void> {
    this.cancels.push(id);
    return this.inner.cancelProvingJob(id);
  }

  getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus> {
    return this.inner.getProvingJobStatus(id);
  }

  getCompletedJobs(ids: ProvingJobId[]): Promise<ProvingJobId[]> {
    return this.inner.getCompletedJobs(ids);
  }

  getProvingJob(filter?: ProvingJobFilter): Promise<GetProvingJobResponse | undefined> {
    return this.agentsPaused ? Promise.resolve(undefined) : this.inner.getProvingJob(filter);
  }

  async reportProvingJobSuccess(
    id: ProvingJobId,
    result: ProofUri,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    // Always settle the reported job (its result must be cached for reuse), but while paused withhold
    // the next job the broker hands back so no new work starts.
    const next = await this.inner.reportProvingJobSuccess(id, result, filter);
    return this.agentsPaused ? undefined : next;
  }

  async reportProvingJobError(
    id: ProvingJobId,
    err: string,
    retry?: boolean,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    const next = await this.inner.reportProvingJobError(id, err, retry, filter);
    return this.agentsPaused ? undefined : next;
  }

  reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    return this.inner.reportProvingJobProgress(id, startedAt, filter);
  }
}

/**
 * E2E tests for a clean prover-node restart with jobs in flight at a shared broker.
 *
 * A clean prover-node shutdown must NOT abort its in-flight broker jobs — sessions are cancelled with
 * `abortJobs: false` and checkpoint sub-trees with `cancelJobsOnStop: false` — so a restarted node
 * re-requests them and the broker returns the existing jobs rather than a fresh `not-found`. The
 * end-state alone ("epoch proven after restart") does not prove this: aborted jobs are revivable at
 * the broker, so proving would recover even if the jobs were wrongly aborted. The discriminating
 * assertions are that the shutdown issued zero `cancelProvingJob` calls and that the in-flight jobs
 * remain `in-queue` (not `aborted`) across it.
 *
 * The broker is a test-owned object shared across both prover-node incarnations (production's external
 * broker topology), so the in-flight jobs survive the restart in memory.
 *
 * Two scenarios, because which jobs are in flight at shutdown depends on how far proving has got:
 * gating the top tree catches only the leaf parity jobs, whereas starving agents from the start keeps
 * the transaction base rollups (and the wider rollup tree) in flight — so we cover both.
 */
describe('single-node/proving/prover_restart', () => {
  let test: SingleNodeTestContext;
  let context: EndToEndContext;
  let node: AztecNode;
  let rollup: RollupContract;
  let logger: Logger;
  let L2_SLOT_DURATION_IN_S: number;

  let realBroker: ProvingBroker;
  let broker: RecordingBrokerProxy;

  const PINNED_PROVER_ID = EthAddress.fromNumber(1);

  // A shared in-memory broker (no dataDirectory) that outlives each prover node.
  const createSharedBroker = async () => {
    realBroker = await createAndStartProvingBroker(
      { ...context.config, dataDirectory: undefined },
      getTelemetryClient(),
    );
    broker = new RecordingBrokerProxy(realBroker);
  };

  afterEach(async () => {
    await test?.teardown();
    await realBroker?.stop();
  });

  describe('in-flight top-tree jobs', () => {
    beforeEach(async () => {
      test = await setupWithProver({
        ...FAST_REORG_TIMING,
        // We own prover-node creation so we can inject the shared broker and drive the stop/restart.
        startProverNode: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: NO_REORG_SUBMISSION_EPOCHS,
        // Recover promptly from any job left in-progress by a withheld piggyback, and never fail a job
        // for retrying while agents are paused.
        proverBrokerJobTimeoutMs: 2_000,
        proverBrokerPollIntervalMs: 500,
        proverBrokerJobMaxRetries: 1_000,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
      await createSharedBroker();
    });

    it('preserves and revives in-flight top-tree jobs across a clean prover-node restart', async () => {
      // Prover node #1, wired to the shared broker and a pinned prover id (so a restart re-requests the
      // exact same content-addressed job ids).
      const node1 = await test.createProverNode({ proverNodeDeps: { broker }, proverId: PINNED_PROVER_ID });
      const proverNode1 = node1.getProverNode() as TestProverNode;

      // Gate top-tree proving of the first full session so it blocks until we release it, giving us a
      // deterministic point at which its top-tree jobs are enqueued at the broker but unproven.
      const { promise: provingGate, resolve: releaseProvingGate } = promiseWithResolvers<void>();
      let gatedSession: ReturnType<TestProverNode['sessionManager']['allSessions']>[number] | undefined;
      proverNode1.setSessionHooks({
        beforeTopTreeProve: async () => {
          // EpochSession flips to `awaiting-root` before awaiting this hook, so the gating session is
          // the live full session in that state. First one to arrive is the one we gate; later ones
          // sail through once the gate is released.
          const session = proverNode1.sessionManager
            .allSessions()
            .find(s => s.getKind() === 'full' && s.getState() === 'awaiting-root');
          if (!session) {
            return;
          }
          gatedSession ??= session;
          logger.warn(`Top-tree proving gated for epoch ${session.getEpochNumber()} — waiting for test to release`);
          await provingGate;
          logger.warn(`Proving gate released for epoch ${session.getEpochNumber()}`);
        },
      });

      // Wait for a full session to complete its checkpoints and block at the top-tree gate.
      const inFlightSession = await retryUntil(
        () => Promise.resolve(gatedSession),
        'full session blocks at the top-tree proving gate',
        L2_SLOT_DURATION_IN_S * 12,
        0.5,
      );
      const gatedEpoch = inFlightSession.getEpochNumber();
      const checkpoints = inFlightSession.getCheckpoints();
      const epochEndCheckpoint = checkpoints[checkpoints.length - 1].checkpoint.number;
      logger.info(`Epoch ${gatedEpoch} is gated at top-tree proving (ends at checkpoint ${epochEndCheckpoint})`);

      // Stop block production so the system goes quiescent (no new sub-tree work), then starve agents so
      // the top-tree jobs pile up unproven when we release the gate.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });
      broker.agentsPaused = true;
      releaseProvingGate();

      // The released top-tree enqueues its jobs; with agents starved they sit `in-queue`. Wait until at
      // least one such job for the gated epoch is pending at the broker, and collect them.
      const pendingTopTreeIds = await retryUntil(
        async () => {
          const candidates = broker.enqueues.filter(e => e.job.epochNumber === gatedEpoch).map(e => e.job.id);
          const inQueue: ProvingJobId[] = [];
          for (const id of new Set(candidates)) {
            if ((await broker.getProvingJobStatus(id)).status === 'in-queue') {
              inQueue.push(id);
            }
          }
          return inQueue.length > 0 ? inQueue : undefined;
        },
        'top-tree jobs are enqueued and pending at the broker',
        30,
        0.2,
      );
      logger.info(`${pendingTopTreeIds.length} top-tree job(s) pending at the broker for epoch ${gatedEpoch}`);

      // Clean shutdown: this drives SessionManager.stop() -> session.cancel({ abortJobs: false }).
      const cancelsBeforeStop = broker.cancels.length;
      await node1.stop();

      // The fix under test: a clean shutdown leaves the in-flight jobs untouched. Pre-fix, the shutdown
      // would abort them — a non-empty `cancels` and an `aborted` status.
      expect(broker.cancels.length).toBe(cancelsBeforeStop);
      for (const id of pendingTopTreeIds) {
        expect((await broker.getProvingJobStatus(id)).status).toBe('in-queue');
      }
      logger.info('Clean shutdown preserved the in-flight top-tree jobs at the broker');

      // Restart: a fresh prover node against the SAME broker and the same prover id. It resyncs from L1
      // and re-drives the epoch; re-requesting the preserved jobs reuses them rather than re-proving.
      const enqueuesBeforeRestart = broker.enqueues.length;
      const node2 = await test.createProverNode({ proverNodeDeps: { broker }, proverId: PINNED_PROVER_ID });
      expect((node2.getProverNode() as TestProverNode).getProverId()).toEqual(PINNED_PROVER_ID);
      broker.agentsPaused = false;

      // Proving resumes automatically and the epoch lands on L1.
      await test.waitUntilProvenCheckpointNumber(epochEndCheckpoint, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpoint);
      logger.info(`Epoch ${gatedEpoch} proven on L1 up to checkpoint ${epochEndCheckpoint} after restart`);

      // Reuse: the restarted node re-requested jobs it found already at the broker rather than as new
      // work — at least one re-enqueue for the epoch returned a cached/pending status, not 'not-found',
      // and none came back 'aborted'.
      const reRequests = broker.enqueues.slice(enqueuesBeforeRestart).filter(e => e.job.epochNumber === gatedEpoch);
      expect(reRequests.some(e => e.returnedStatus !== 'not-found')).toBe(true);
      expect(reRequests.every(e => e.returnedStatus !== 'aborted')).toBe(true);
    });
  });

  describe('in-flight transaction proofs', () => {
    beforeEach(async () => {
      test = await setupWithProver({
        ...FAST_REORG_TIMING,
        numberOfAccounts: 1,
        startProverNode: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        minTxsPerBlock: 0,
        aztecProofSubmissionEpochs: NO_REORG_SUBMISSION_EPOCHS,
        // Keep the frozen epoch's jobs around while block production advances during the freeze.
        proverBrokerMaxEpochsToKeepResultsFor: 10,
      });
      ({ rollup, logger, context } = test);
      node = context.aztecNode;
      await createSharedBroker();
    });

    it('revives non-parity transaction proofs after a clean prover-node restart', async () => {
      // Starve agents before the prover node exists: it will enqueue jobs at the broker but prove none.
      broker.agentsPaused = true;

      const node1 = await test.createProverNode({ proverNodeDeps: { broker }, proverId: PINNED_PROVER_ID });
      expect((node1.getProverNode() as TestProverNode).getProverId()).toEqual(PINNED_PROVER_ID);

      // Anchor on a fresh epoch, then land a couple of real txs in it so the broker gets actual
      // transaction base-rollup jobs (not just the empty-block parity/root jobs).
      await test.waitUntilNextEpochStarts();
      const contract = await test.registerTestContract(context.wallet);
      const receipts = [];
      for (let i = 0; i < 2; i++) {
        const provenTx = await proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(i + 1)), {
          from: context.accounts[0],
        });
        receipts.push(await provenTx.send());
      }
      const txCheckpoint = (await node.getBlock(receipts[receipts.length - 1].blockNumber!))!.checkpointNumber;
      const txCp = await retryUntil(
        async () => (await node.getCheckpoints(txCheckpoint, 1))[0],
        `archiver indexes checkpoint ${txCheckpoint}`,
        30,
        0.2,
      );
      const txEpoch = getEpochAtSlot(txCp.header.slotNumber, test.constants);
      logger.info(`Landed 2 txs in checkpoint ${txCheckpoint} (epoch ${txEpoch})`);

      // Wait until the transaction base-rollup jobs are enqueued and pending (in-queue) at the broker —
      // these are the non-parity proofs we want to see revived. Agents are starved, so they cannot
      // complete.
      const pendingTxProofIds = await retryUntil(
        async () => {
          const ids = [...new Set(broker.enqueues.filter(e => isTxBaseRollup(e.job.type)).map(e => e.job.id))];
          const inQueue: ProvingJobId[] = [];
          for (const id of ids) {
            if ((await broker.getProvingJobStatus(id)).status === 'in-queue') {
              inQueue.push(id);
            }
          }
          return inQueue.length > 0 ? inQueue : undefined;
        },
        'transaction base-rollup jobs are enqueued and pending at the broker',
        60,
        0.5,
      );
      logger.info(
        `${pendingTxProofIds.length} transaction base-rollup job(s) pending at the broker for epoch ${txEpoch}`,
      );

      // Complete the epoch on L1 (so a restart can prove it), then stop producing so no further epochs
      // pile up jobs while the prover is down.
      await test.warpToEpochStart(txEpoch + 1);
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(epochEndCheckpoint).toBeGreaterThanOrEqual(txCheckpoint);

      // Clean shutdown: this must not abort any broker jobs.
      const cancelsBeforeStop = broker.cancels.length;
      const enqueuesBeforeRestart = broker.enqueues.length;
      await node1.stop();

      expect(broker.cancels.length).toBe(cancelsBeforeStop);
      for (const id of pendingTxProofIds) {
        expect((await broker.getProvingJobStatus(id)).status).toBe('in-queue');
      }
      logger.info('Clean shutdown preserved the in-flight transaction proofs at the broker');

      // Restart against the same broker with the same prover id and let agents run.
      const node2 = await test.createProverNode({ proverNodeDeps: { broker }, proverId: PINNED_PROVER_ID });
      expect((node2.getProverNode() as TestProverNode).getProverId()).toEqual(PINNED_PROVER_ID);
      broker.agentsPaused = false;

      // Proving resumes automatically and the epoch lands on L1.
      await test.waitUntilProvenCheckpointNumber(epochEndCheckpoint, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpoint);
      logger.info(`Epoch ${txEpoch} proven on L1 up to checkpoint ${epochEndCheckpoint} after restart`);

      // The transaction proofs that were pending before the stop are re-requested and reused (returned
      // with an existing status, never a fresh `not-found`, and never `aborted`).
      const reRequests = broker.enqueues.slice(enqueuesBeforeRestart);
      const revivedTxProofs = reRequests.filter(
        e => pendingTxProofIds.includes(e.job.id) && e.returnedStatus !== 'not-found',
      );
      expect(revivedTxProofs.length).toBeGreaterThan(0);
      // The revived work is genuinely non-parity (the leaf parity jobs are not what we're asserting on).
      expect(revivedTxProofs.every(e => !isParity(e.job.type))).toBe(true);
      expect(reRequests.every(e => e.returnedStatus !== 'aborted')).toBe(true);
    });
  });
});
