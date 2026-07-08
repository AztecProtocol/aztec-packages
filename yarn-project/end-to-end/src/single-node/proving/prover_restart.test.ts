import type { Logger } from '@aztec/aztec.js/log';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { type ProvingBroker, createAndStartProvingBroker } from '@aztec/prover-client/broker';
import type { TestProverNode } from '@aztec/prover-node/test';
import { EthAddress } from '@aztec/stdlib/block';
import type {
  GetProvingJobResponse,
  ProofUri,
  ProvingJob,
  ProvingJobBroker,
  ProvingJobFilter,
  ProvingJobId,
  ProvingJobStatus,
} from '@aztec/stdlib/interfaces/server';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { expect, jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { NO_REORG_SUBMISSION_EPOCHS, setupWithProver } from '../setup.js';
import { FAST_REORG_TIMING, SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 20);

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
    // the next job the broker hands back so no new work starts. The withheld job is left in-progress
    // and the broker's own timeout re-enqueues it, so nothing is lost.
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
 * E2E test for a clean prover-node restart with jobs in flight at the broker.
 *
 * A clean prover-node shutdown must NOT abort its in-flight broker jobs — it cancels sessions with
 * `abortJobs: false` so the jobs stay in the broker for the restarted node to reuse, rather than
 * being re-proven from scratch. Note the end-state alone ("epoch proven after restart") does not
 * prove this fix: aborted jobs are revivable at the broker, so proving would recover even if the jobs
 * were wrongly aborted. The discriminating assertions are therefore that the shutdown issued zero
 * `cancelProvingJob` calls and that the in-flight jobs remain `in-queue` (not `aborted`) across it.
 *
 * The broker is a test-owned object shared across both prover-node incarnations (production's external
 * broker topology), so the in-flight jobs survive the restart in memory.
 */
describe('single-node/proving/prover_restart', () => {
  let test: SingleNodeTestContext;
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let L2_SLOT_DURATION_IN_S: number;

  let realBroker: ProvingBroker;
  let broker: RecordingBrokerProxy;

  const PINNED_PROVER_ID = EthAddress.fromNumber(1);

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

    // A shared in-memory broker (no dataDirectory) that outlives each prover node.
    realBroker = await createAndStartProvingBroker(
      { ...context.config, dataDirectory: undefined },
      getTelemetryClient(),
    );
    broker = new RecordingBrokerProxy(realBroker);
  });

  afterEach(async () => {
    await test?.teardown();
    await realBroker?.stop();
  });

  it('resumes proving after a clean prover-node restart, reusing in-flight broker jobs', async () => {
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
        // EpochSession flips to `awaiting-root` before awaiting this hook, so the gating session is the
        // live full session in that state. First one to arrive is the one we gate; later ones sail
        // through once the gate is released.
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
    logger.info('Clean shutdown preserved the in-flight jobs at the broker');

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
