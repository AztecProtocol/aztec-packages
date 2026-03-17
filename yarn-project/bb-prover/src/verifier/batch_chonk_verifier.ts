import { BackendType, Barretenberg } from '@aztec/bb.js';
import { FifoFrameReader } from '@aztec/foundation/fifo';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import { Unpackr } from 'msgpackr';
import { execFile } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { BBConfig } from '../config.js';
import { ChonkVerifierMetrics } from './chonk_verifier_metrics.js';

const execFileAsync = promisify(execFile);

/** Result from the FIFO, matching the C++ VerifyResult struct. */
interface FifoVerifyResult {
  request_id: number;
  status: number;
  error_message: string;
  time_in_queue_ms: number;
  time_in_verify_ms: number;
  batch_failure_count: number;
}

/** Maps client protocol artifacts used for chonk verification to VK indices. */
const CHONK_VK_ARTIFACTS = ['HidingKernelToRollup', 'HidingKernelToPublic'] as const;

interface PendingRequest {
  resolve: (result: IVCProofVerificationResult) => void;
  reject: (error: Error) => void;
  totalTimer: Timer;
}

/**
 * Batch verifier for Chonk IVC proofs. Uses the bb batch verifier service
 * which batches IPA verification into a single SRS MSM for better throughput.
 *
 * Architecture:
 * - Spawns a persistent `bb msgpack run` process via Barretenberg (native backend)
 * - Sends proofs via the msgpack RPC protocol (ChonkBatchVerifierQueue)
 * - Receives results via a named FIFO pipe (async, out-of-order)
 * - Bisects batch failures to isolate individual bad proofs
 */
export class BatchChonkVerifier implements ClientProtocolCircuitVerifier {
  private bb!: Barretenberg;
  private fifoPath: string;
  private nextRequestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private sendQueue: SerialQueue;
  private fifoReader: FifoFrameReader;
  private metrics: ChonkVerifierMetrics;
  private logger = createLogger('bb-prover:batch_chonk_verifier');
  /** Maps artifact name to VK index in the batch verifier. */
  private vkIndexMap = new Map<string, number>();
  /** Bound cleanup handler for process exit signals. */
  private exitCleanup: (() => void) | null = null;

  private constructor(
    private config: BBConfig,
    private batchSize: number,
    private label: string,
    telemetry: TelemetryClient,
  ) {
    this.fifoPath = path.join(os.tmpdir(), `bb-batch-${label}-${process.pid}-${Date.now()}.fifo`);
    this.metrics = new ChonkVerifierMetrics(telemetry, 'BatchChonkVerifier');
    this.fifoReader = new FifoFrameReader();
    this.sendQueue = new SerialQueue();
    this.sendQueue.start(1);
  }

  /**
   * Create and start a new BatchChonkVerifier.
   * @param config - BB binary configuration.
   * @param telemetry - Telemetry client for metrics.
   * @param batchSize - Max proofs per batch.
   * @param label - Descriptive label for FIFO path and logging (e.g. 'peer', 'rpc').
   */
  static async new(
    config: BBConfig,
    telemetry: TelemetryClient = getTelemetryClient(),
    batchSize = 8,
    label = 'verifier',
  ): Promise<BatchChonkVerifier> {
    const verifier = new BatchChonkVerifier(config, batchSize, label, telemetry);
    await verifier.start();
    return verifier;
  }

  private async start(): Promise<void> {
    this.logger.info('Starting BatchChonkVerifier');

    // Force native backend — batch verification is not supported in WASM
    this.bb = await Barretenberg.new({
      bbPath: this.config.bbBinaryPath,
      backend: BackendType.NativeUnixSocket,
    });
    await this.bb.initSRSChonk();

    // Collect VKs for all chonk-verifiable circuits
    const vkBuffers: Uint8Array[] = [];
    for (const artifact of CHONK_VK_ARTIFACTS) {
      const vk = ProtocolCircuitVks[artifact];
      if (!vk) {
        throw new Error(`Missing VK for ${artifact}`);
      }
      this.vkIndexMap.set(artifact, vkBuffers.length);
      vkBuffers.push(vk.keyAsBytes);
    }

    // Create FIFO pipe for async result delivery
    await execFileAsync('mkfifo', [this.fifoPath]);
    this.registerExitCleanup();

    // Start the batch verifier service in bb
    await this.bb.chonkBatchVerifierStart({
      vks: vkBuffers,
      numCores: this.config.bbIVCConcurrency || 0,
      batchSize: this.batchSize,
      fifoPath: this.fifoPath,
    });

    // Start FIFO reader (must happen after service start, since bb opens FIFO for writing)
    this.startFifoReader();

    this.logger.info('BatchChonkVerifier started', { fifoPath: this.fifoPath });
  }

  public verifyProof(tx: Tx): Promise<IVCProofVerificationResult> {
    const totalTimer = new Timer();
    const requestId = this.nextRequestId++;
    const circuit = tx.data.forPublic ? 'HidingKernelToPublic' : 'HidingKernelToRollup';
    const vkIndex = this.vkIndexMap.get(circuit);
    if (vkIndex === undefined) {
      throw new Error(`No VK index for circuit ${circuit}`);
    }

    // Attach public inputs to get the flat proof fields array (C++ splits into ChonkProof segments)
    const proofWithPubInputs = tx.chonkProof.attachPublicInputs(tx.data.publicInputs().toFields());
    const proofFields = proofWithPubInputs.fieldsWithPublicInputs.map(f => f.toBuffer());

    // Create pending promise
    const resultPromise = new Promise<IVCProofVerificationResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, totalTimer });
    });

    // Enqueue via the serial send queue (bb pipe is single-request)
    void this.sendQueue.put(async () => {
      await this.bb.chonkBatchVerifierQueue({
        requestId,
        vkIndex,
        proofFields,
      });
    });

    return resultPromise;
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping BatchChonkVerifier');

    // Stop accepting new proofs
    await this.sendQueue.end();

    // Stop the bb service (flushes remaining proofs)
    try {
      await this.bb.chonkBatchVerifierStop({});
    } catch (err) {
      this.logger.warn(`Error stopping batch verifier service: ${err}`);
    }

    // Stop FIFO reader
    this.fifoReader.stop();

    // Clean up FIFO file and deregister exit handler
    await unlink(this.fifoPath).catch(() => {});
    this.deregisterExitCleanup();

    // Reject any remaining pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('BatchChonkVerifier stopped'));
      this.pendingRequests.delete(id);
    }

    // Destroy bb process
    await this.bb.destroy();

    this.logger.info('BatchChonkVerifier stopped');
  }

  private startFifoReader(): void {
    const unpackr = new Unpackr({ useRecords: false });

    this.fifoReader.on('frame', (payload: Buffer) => {
      try {
        const result = unpackr.unpack(payload) as FifoVerifyResult;
        this.handleResult(result);
      } catch (err) {
        this.logger.error(`FIFO: failed to decode msgpack result: ${err}`);
      }
    });

    this.fifoReader.on('error', (err: Error) => {
      this.logger.error(`FIFO reader error: ${err}`);
    });

    this.fifoReader.on('end', () => {
      this.logger.debug('FIFO reader: stream ended');
    });

    this.fifoReader.start(this.fifoPath);
  }

  private handleResult(result: FifoVerifyResult): void {
    const pending = this.pendingRequests.get(result.request_id);
    if (!pending) {
      this.logger.warn(`Received result for unknown request_id=${result.request_id}`);
      return;
    }
    this.pendingRequests.delete(result.request_id);

    const valid = result.status === 0; // VerifyStatus::OK
    const durationMs = result.time_in_verify_ms;
    const totalDurationMs = pending.totalTimer.ms();

    const ivcResult: IVCProofVerificationResult = { valid, durationMs, totalDurationMs };
    this.metrics.recordIVCVerification(ivcResult);
    this.metrics.updateQueueDepth(this.pendingRequests.size);

    if (!valid) {
      this.logger.warn(`Proof verification failed for request_id=${result.request_id}: ${result.error_message}`);
    } else {
      this.logger.debug(`Proof verified`, {
        requestId: result.request_id,
        durationMs: Math.ceil(durationMs),
        totalDurationMs: Math.ceil(totalDurationMs),
      });
    }

    pending.resolve(ivcResult);
  }

  private registerExitCleanup(): void {
    // Signal handlers must be synchronous — unlinkSync is intentional here
    this.exitCleanup = () => {
      try {
        unlinkSync(this.fifoPath);
      } catch {
        /* ignore */
      }
    };
    process.on('exit', this.exitCleanup);
    process.on('SIGINT', this.exitCleanup);
    process.on('SIGTERM', this.exitCleanup);
  }

  private deregisterExitCleanup(): void {
    if (this.exitCleanup) {
      process.removeListener('exit', this.exitCleanup);
      process.removeListener('SIGINT', this.exitCleanup);
      process.removeListener('SIGTERM', this.exitCleanup);
      this.exitCleanup = null;
    }
  }
}
