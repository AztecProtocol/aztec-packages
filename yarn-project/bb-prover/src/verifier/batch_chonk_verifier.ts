import { BackendType, Barretenberg } from '@aztec/bb.js';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import {
  Attributes,
  type BatchObservableResult,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import { Unpackr } from 'msgpackr';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHistogram } from 'node:perf_hooks';

import type { BBConfig } from '../config.js';

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

class BatchVerifierMetrics {
  private ivcVerificationHistogram: Histogram;
  private ivcTotalVerificationHistogram: Histogram;
  private ivcFailureCount: UpDownCounter;
  private queueDepth: ObservableGauge;
  private localHistogramOk = createHistogram({ min: 1, max: 5 * 60 * 1000 });
  private localHistogramFails = createHistogram({ min: 1, max: 5 * 60 * 1000 });
  private aggDurationMetrics: Record<'min' | 'max' | 'p50' | 'p90' | 'avg', ObservableGauge>;
  private currentQueueDepth = 0;

  constructor(client: TelemetryClient, name = 'BatchChonkVerifier') {
    const meter = client.getMeter(name);
    this.ivcVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TIME);
    this.ivcTotalVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TOTAL_TIME);
    this.ivcFailureCount = createUpDownCounterWithDefault(meter, Metrics.IVC_VERIFIER_FAILURE_COUNT);
    this.queueDepth = meter.createObservableGauge(Metrics.IVC_VERIFIER_QUEUE_DEPTH);
    this.queueDepth.addCallback(res => res.observe(this.currentQueueDepth));
    this.aggDurationMetrics = {
      avg: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_AVG),
      max: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MAX),
      min: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MIN),
      p50: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P50),
      p90: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P90),
    };
    meter.addBatchObservableCallback(this.aggregate, Object.values(this.aggDurationMetrics));
  }

  updateQueueDepth(depth: number) {
    this.currentQueueDepth = depth;
  }

  recordIVCVerification(result: IVCProofVerificationResult) {
    this.ivcVerificationHistogram.record(Math.ceil(result.durationMs), { [Attributes.OK]: result.valid });
    this.ivcTotalVerificationHistogram.record(Math.ceil(result.totalDurationMs), { [Attributes.OK]: result.valid });
    if (!result.valid) {
      this.ivcFailureCount.add(1);
      this.localHistogramFails.record(Math.max(Math.ceil(result.durationMs), 1));
    } else {
      this.localHistogramOk.record(Math.max(Math.ceil(result.durationMs), 1));
    }
  }

  private aggregate = (res: BatchObservableResult) => {
    for (const [histogram, ok] of [
      [this.localHistogramOk, true],
      [this.localHistogramFails, false],
    ] as const) {
      if (histogram.count === 0) {
        continue;
      }
      res.observe(this.aggDurationMetrics.avg, histogram.mean, { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.max, histogram.max, { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.min, histogram.min, { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.p50, histogram.percentile(50), { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.p90, histogram.percentile(90), { [Attributes.OK]: ok });
    }
  };
}

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
  private fifoStream: fs.ReadStream | null = null;
  private fifoReaderRunning = false;
  private metrics: BatchVerifierMetrics;
  private logger = createLogger('bb-prover:batch_chonk_verifier');
  /** Maps artifact name to VK index in the batch verifier. */
  private vkIndexMap = new Map<string, number>();

  private constructor(
    private config: BBConfig,
    private batchSize: number,
    private label: string,
    telemetry: TelemetryClient,
  ) {
    this.fifoPath = path.join(os.tmpdir(), `bb-batch-${label}-${process.pid}-${Date.now()}.fifo`);
    this.metrics = new BatchVerifierMetrics(telemetry);
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
    execSync(`mkfifo ${this.fifoPath}`);

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
    this.fifoReaderRunning = false;
    if (this.fifoStream) {
      this.fifoStream.destroy();
      this.fifoStream = null;
    }

    // Clean up FIFO file
    try {
      fs.unlinkSync(this.fifoPath);
    } catch {
      // ignore
    }

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
    this.fifoReaderRunning = true;
    const unpackr = new Unpackr({ useRecords: false });

    const stream = fs.createReadStream(this.fifoPath, { highWaterMark: 64 * 1024 });
    this.fifoStream = stream;

    // State machine for parsing length-delimited msgpack frames
    let pendingBuf: Buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      pendingBuf = pendingBuf.length > 0 ? Buffer.concat([pendingBuf, buf]) : buf;

      // Process all complete frames in the buffer
      while (pendingBuf.length >= 4) {
        const payloadLen = pendingBuf.readUInt32BE(0);
        if (payloadLen === 0 || payloadLen > 10 * 1024 * 1024) {
          this.logger.warn(`FIFO: invalid payload length ${payloadLen}`);
          stream.destroy();
          return;
        }

        const frameLen = 4 + payloadLen;
        if (pendingBuf.length < frameLen) {
          break; // Wait for more data
        }

        const payloadBuf = pendingBuf.subarray(4, frameLen);
        pendingBuf = pendingBuf.subarray(frameLen);

        try {
          const result = unpackr.unpack(payloadBuf) as FifoVerifyResult;
          this.handleResult(result);
        } catch (err) {
          this.logger.error(`FIFO: failed to decode msgpack result: ${err}`);
        }
      }
    });

    stream.on('error', (err: Error) => {
      if (this.fifoReaderRunning) {
        this.logger.error(`FIFO reader error: ${err}`);
      }
    });

    stream.on('end', () => {
      this.logger.debug('FIFO reader: stream ended');
    });
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
}
