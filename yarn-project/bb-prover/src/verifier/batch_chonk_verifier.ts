import { BackendType, Barretenberg } from '@aztec/bb.js';
import { FifoFrameReader } from '@aztec/foundation/fifo';
import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { Unpackr } from 'msgpackr';
import { execFile } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type { BBConfig } from '../config.js';
import { IVCVerifierMetrics } from './queued_chonk_verifier.js';

const execFileAsync = promisify(execFile);

/** Result from the FIFO, matching the C++ VerifyResult struct. */
interface FifoVerifyResult {
  request_id: number;
  status: number;
  error_message: string;
  time_in_verify_ms: number;
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
  private logger = createLogger('bb-prover:batch_chonk_verifier');
  private metrics: IVCVerifierMetrics;
  /** Maps artifact name to VK index in the batch verifier. */
  private vkIndexMap = new Map<string, number>();
  /** Bound cleanup handler for process exit signals. */
  private exitCleanup: (() => void) | null = null;

  private constructor(
    private config: Pick<BBConfig, 'bbChonkVerifyConcurrency'> & Partial<Pick<BBConfig, 'bbBinaryPath'>>,
    private vkBuffers: Uint8Array[],
    private batchSize: number,
    private label: string,
  ) {
    this.fifoPath = path.join(os.tmpdir(), `bb-batch-${label}-${process.pid}-${Date.now()}.fifo`);
    this.fifoReader = new FifoFrameReader();
    this.sendQueue = new SerialQueue();
    this.sendQueue.start(1);
    this.metrics = new IVCVerifierMetrics(getTelemetryClient(), `BatchChonkVerifier-${label}`);
  }

  /** Create and start a BatchChonkVerifier using the protocol circuit VKs. */
  static async new(config: BBConfig, batchSize: number, label: string): Promise<BatchChonkVerifier> {
    const vkBuffers: Uint8Array[] = [];
    const vkIndexMap = new Map<string, number>();
    for (const artifact of CHONK_VK_ARTIFACTS) {
      const vk = ProtocolCircuitVks[artifact];
      if (!vk) {
        throw new Error(`Missing VK for ${artifact}`);
      }
      vkIndexMap.set(artifact, vkBuffers.length);
      vkBuffers.push(vk.keyAsBytes);
    }
    const verifier = new BatchChonkVerifier(config, vkBuffers, batchSize, label);
    verifier.vkIndexMap = vkIndexMap;
    await verifier.start();
    return verifier;
  }

  /** Create and start a BatchChonkVerifier with custom VKs (for testing). */
  static async newForTesting(
    config: Pick<BBConfig, 'bbChonkVerifyConcurrency'> & Partial<Pick<BBConfig, 'bbBinaryPath'>>,
    vks: Uint8Array[],
    batchSize: number,
  ): Promise<BatchChonkVerifier> {
    const verifier = new BatchChonkVerifier(config, vks, batchSize, 'test');
    for (let i = 0; i < vks.length; i++) {
      verifier.vkIndexMap.set(String(i), i);
    }
    await verifier.start();
    return verifier;
  }

  private async start(): Promise<void> {
    this.logger.info('Starting BatchChonkVerifier');

    this.bb = await Barretenberg.new({
      bbPath: this.config.bbBinaryPath,
      backend: BackendType.NativeUnixSocket,
    });
    await this.bb.initSRSChonk();

    await execFileAsync('mkfifo', [this.fifoPath]);
    this.registerExitCleanup();

    await this.bb.chonkBatchVerifierStart({
      vks: this.vkBuffers,
      numCores: this.config.bbChonkVerifyConcurrency || 0,
      batchSize: this.batchSize,
      fifoPath: this.fifoPath,
    });

    this.startFifoReader();
    this.logger.info('BatchChonkVerifier started', { fifoPath: this.fifoPath });
  }

  public verifyProof(tx: Tx): Promise<IVCProofVerificationResult> {
    const circuit = tx.data.forPublic ? 'HidingKernelToPublic' : 'HidingKernelToRollup';
    const vkIndex = this.vkIndexMap.get(circuit);
    if (vkIndex === undefined) {
      throw new Error(`No VK index for circuit ${circuit}`);
    }
    const proofWithPubInputs = tx.chonkProof.attachPublicInputs(tx.data.publicInputs().toFields());
    const proofFields = proofWithPubInputs.fieldsWithPublicInputs.map(f => f.toBuffer());
    return this.enqueueProof(vkIndex, proofFields);
  }

  /** Enqueue raw proof fields for verification. Used directly by tests with custom VKs. */
  public enqueueProof(vkIndex: number, proofFields: Uint8Array[]): Promise<IVCProofVerificationResult> {
    const totalTimer = new Timer();
    const requestId = this.nextRequestId++;

    const resultPromise = new Promise<IVCProofVerificationResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, totalTimer });
    });

    void this.sendQueue
      .put(async () => {
        await this.bb.chonkBatchVerifierQueue({
          requestId,
          vkIndex,
          proofFields,
        });
      })
      .catch(err => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          pending.reject(err instanceof Error ? err : new Error(String(err)));
        }
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
      for (const [id, pending] of this.pendingRequests) {
        pending.reject(new Error('FIFO stream ended unexpectedly'));
        this.pendingRequests.delete(id);
      }
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
