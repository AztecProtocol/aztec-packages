import { createLogger } from '@aztec/foundation/log';
import type { WorldStateMemoryStats } from '@aztec/world-state';

import { Storage } from '@google-cloud/storage';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as v8 from 'node:v8';

const log = createLogger('prover-node:memory-debug');

/** Callback type for getting native world state memory stats */
export type NativeMemoryStatsCallback = () => Promise<WorldStateMemoryStats>;

/** Memory usage snapshot */
export type MemorySnapshot = {
  timestamp: number;
  label: string;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  rss: number;
};

/** Tracks memory usage over time */
export class MemoryDebugger {
  private snapshots: MemorySnapshot[] = [];
  private heapSnapshotDir: string;
  private enabled: boolean;
  private jobCounter = 0;
  private gcsBucket: string | undefined;
  private gcsPrefix: string = '';
  private storage: Storage | undefined;
  private nativeMemoryStatsCallback: NativeMemoryStatsCallback | undefined;
  private lastNativeStats: WorldStateMemoryStats | undefined;

  constructor(opts: { heapSnapshotDir?: string; enabled?: boolean } = {}) {
    this.heapSnapshotDir =
      opts.heapSnapshotDir ?? process.env.PROVER_NODE_HEAP_SNAPSHOT_DIR ?? '/tmp/aztec-heap-snapshots';
    this.enabled = opts.enabled ?? process.env.PROVER_NODE_MEMORY_DEBUG === '1';

    // GCS bucket configuration: gs://bucket-name/optional-prefix
    const gcsPath = process.env.PROVER_NODE_HEAP_SNAPSHOT_GCS;
    if (gcsPath) {
      const match = gcsPath.match(/^gs:\/\/([^/]+)\/?(.*)$/);
      if (match) {
        this.gcsBucket = match[1];
        this.gcsPrefix = match[2] || 'heap-snapshots';
        this.storage = new Storage();
        log.info(`GCS upload enabled: gs://${this.gcsBucket}/${this.gcsPrefix}`);
      } else {
        log.warn(`Invalid GCS path: ${gcsPath}. Expected format: gs://bucket-name/optional-prefix`);
      }
    }

    if (this.enabled) {
      log.info(`Memory debugging enabled. Heap snapshots will be saved to ${this.heapSnapshotDir}`);
      if (!fs.existsSync(this.heapSnapshotDir)) {
        fs.mkdirSync(this.heapSnapshotDir, { recursive: true });
      }
    }
  }

  /**
   * Set the callback for getting native world state memory stats.
   * This should be called after the world state is initialized.
   */
  setNativeMemoryStatsCallback(callback: NativeMemoryStatsCallback): void {
    this.nativeMemoryStatsCallback = callback;
    if (this.enabled) {
      log.info(`[MEMORY] Native memory stats callback registered`);
    }
  }

  /**
   * Fetch and log native world state memory stats.
   * This provides detailed cache sizes for all merkle tree forks.
   */
  async logNativeMemoryStats(label: string): Promise<WorldStateMemoryStats | undefined> {
    if (!this.enabled || !this.nativeMemoryStatsCallback) {
      return undefined;
    }

    try {
      const stats = await this.nativeMemoryStatsCallback();
      this.lastNativeStats = stats;

      log.info(`[NATIVE MEMORY] ${label}`, {
        totalForks: stats.totalForks,
        forks: stats.forks.map(f => ({
          forkId: f.forkId,
          blockNumber: f.blockNumber,
          noteHashTree: `nodes=${f.noteHashTreeStats.nodesCount}, indices=${f.noteHashTreeStats.indicesCount}, leaves=${f.noteHashTreeStats.leavesCount}`,
          nullifierTree: `nodes=${f.nullifierTreeStats.nodesCount}, indices=${f.nullifierTreeStats.indicesCount}, leaves=${f.nullifierTreeStats.leavesCount}`,
          publicDataTree: `nodes=${f.publicDataTreeStats.nodesCount}, indices=${f.publicDataTreeStats.indicesCount}, leaves=${f.publicDataTreeStats.leavesCount}`,
        })),
      });

      return stats;
    } catch (err) {
      log.error(`[NATIVE MEMORY] Failed to get native memory stats`, err);
      return undefined;
    }
  }

  /** Log current memory usage with a label */
  logMemory(label: string): MemorySnapshot | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const mem = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      label,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      rss: mem.rss,
    };

    this.snapshots.push(snapshot);

    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (mem.rss / 1024 / 1024).toFixed(2);
    const externalMB = (mem.external / 1024 / 1024).toFixed(2);
    const arrayBuffersMB = (mem.arrayBuffers / 1024 / 1024).toFixed(2);

    // Native memory (C++/NAPI) = RSS - heapTotal - arrayBuffers (approximate)
    // This captures merkle tree allocations and other native code
    const nativeEstimateMB = ((mem.rss - mem.heapTotal - mem.arrayBuffers) / 1024 / 1024).toFixed(2);

    log.info(`[MEMORY] ${label}`, {
      heapTotalMB,
      heapUsedMB,
      rssMB,
      externalMB,
      nativeEstimateMB,
      arrayBuffersMB,
    });

    return snapshot;
  }

  /** Calculate memory delta between two labels */
  getMemoryDelta(
    startLabel: string,
    endLabel: string,
  ): { heapDeltaMB: number; rssDeltaMB: number; nativeDeltaMB: number } | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const startSnapshot = this.snapshots.find(s => s.label === startLabel);
    const endSnapshot = [...this.snapshots].reverse().find(s => s.label === endLabel);

    if (!startSnapshot || !endSnapshot) {
      return undefined;
    }

    const heapDeltaMB = (endSnapshot.heapUsed - startSnapshot.heapUsed) / 1024 / 1024;
    const rssDeltaMB = (endSnapshot.rss - startSnapshot.rss) / 1024 / 1024;

    // Native memory delta (C++/NAPI including merkle trees)
    const startNative = startSnapshot.rss - startSnapshot.heapTotal - startSnapshot.arrayBuffers;
    const endNative = endSnapshot.rss - endSnapshot.heapTotal - endSnapshot.arrayBuffers;
    const nativeDeltaMB = (endNative - startNative) / 1024 / 1024;

    log.info(`[MEMORY DELTA] ${startLabel} -> ${endLabel}`, {
      heapDeltaMB: heapDeltaMB.toFixed(2),
      rssDeltaMB: rssDeltaMB.toFixed(2),
      nativeDeltaMB: nativeDeltaMB.toFixed(2),
    });

    return { heapDeltaMB, rssDeltaMB, nativeDeltaMB };
  }

  /** Take a V8 heap snapshot and save to disk, optionally upload to GCS */
  async takeHeapSnapshot(label: string): Promise<string | undefined> {
    if (!this.enabled) {
      return undefined;
    }

    // Force garbage collection before taking snapshot (if exposed)
    if (global.gc) {
      log.info(`[MEMORY] Running garbage collection before heap snapshot...`);
      global.gc();
    } else {
      log.warn(`[MEMORY] gc() not available. Run node with --expose-gc for more accurate snapshots.`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `heap-${label}-${timestamp}.heapsnapshot`;
    const filepath = path.join(this.heapSnapshotDir, filename);

    log.info(`[MEMORY] Taking heap snapshot: ${filepath}`);

    const snapshotPath = v8.writeHeapSnapshot(filepath);
    if (!snapshotPath) {
      log.error(`[MEMORY] Failed to write heap snapshot`);
      return undefined;
    }

    log.info(`[MEMORY] Heap snapshot saved locally: ${snapshotPath}`);

    // Upload to GCS if configured
    if (this.storage && this.gcsBucket) {
      try {
        const gcsPath = `${this.gcsPrefix}/${filename}`;
        log.info(`[MEMORY] Uploading heap snapshot to gs://${this.gcsBucket}/${gcsPath}`);

        await this.storage.bucket(this.gcsBucket).upload(snapshotPath, {
          destination: gcsPath,
          metadata: {
            contentType: 'application/json',
            metadata: {
              label,
              timestamp,
              heapUsed: String(process.memoryUsage().heapUsed),
              rss: String(process.memoryUsage().rss),
            },
          },
        });

        const gcsUri = `gs://${this.gcsBucket}/${gcsPath}`;
        log.info(`[MEMORY] Heap snapshot uploaded to ${gcsUri}`);

        // Optionally delete local file after successful upload
        if (process.env.PROVER_NODE_HEAP_SNAPSHOT_DELETE_LOCAL === '1') {
          fs.unlinkSync(snapshotPath);
          log.info(`[MEMORY] Deleted local snapshot: ${snapshotPath}`);
        }

        return gcsUri;
      } catch (err) {
        log.error(`[MEMORY] Failed to upload heap snapshot to GCS`, err);
        // Return local path if GCS upload fails
        return snapshotPath;
      }
    }

    return snapshotPath;
  }

  /** Mark the start of a proving job */
  onJobStart(epochNumber: number, jobId: string): void {
    if (!this.enabled) {
      return;
    }

    this.jobCounter++;
    const label = `job-start-epoch-${epochNumber}-${jobId}`;
    this.logMemory(label);

    // Take heap snapshot every N jobs to track growth
    const snapshotInterval = parseInt(process.env.PROVER_NODE_HEAP_SNAPSHOT_INTERVAL ?? '5', 10);
    if (this.jobCounter % snapshotInterval === 1) {
      void this.takeHeapSnapshot(`before-job-${this.jobCounter}`);
    }
  }

  /** Mark the end of a proving job */
  onJobEnd(epochNumber: number, jobId: string, state: string): void {
    if (!this.enabled) {
      return;
    }

    const label = `job-end-epoch-${epochNumber}-${jobId}-${state}`;
    this.logMemory(label);

    // Log delta from job start
    const startLabel = `job-start-epoch-${epochNumber}-${jobId}`;
    this.getMemoryDelta(startLabel, label);

    // Log any open forks - these would indicate leaks
    const forkTracker = getForkTracker();
    const openForks = forkTracker.getOpenForkCount();
    if (openForks > 0) {
      log.warn(`[MEMORY] Job ended with ${openForks} forks still open - potential native memory leak!`);
      forkTracker.logOpenForks();
    }

    // Log native memory stats (async, fire and forget)
    void this.logNativeMemoryStats(`job-end-epoch-${epochNumber}`);

    // Take heap snapshot after job completion
    const snapshotInterval = parseInt(process.env.PROVER_NODE_HEAP_SNAPSHOT_INTERVAL ?? '5', 10);
    if (this.jobCounter % snapshotInterval === 0) {
      void this.takeHeapSnapshot(`after-job-${this.jobCounter}`);
    }

    // Write stats file after each job so we can track progress
    void this.writeStatsFile();
  }

  /** Log memory at a custom checkpoint */
  checkpoint(name: string): void {
    this.logMemory(`checkpoint-${name}`);
  }

  /** Get all snapshots for analysis */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /** Clear stored snapshots */
  clearSnapshots(): void {
    this.snapshots = [];
  }

  /** Print a summary of memory growth */
  printSummary(): void {
    if (!this.enabled || this.snapshots.length < 2) {
      return;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    const heapGrowthMB = (last.heapUsed - first.heapUsed) / 1024 / 1024;
    const rssGrowthMB = (last.rss - first.rss) / 1024 / 1024;

    log.info(`[MEMORY SUMMARY]`, {
      totalSnapshots: this.snapshots.length,
      durationMs: last.timestamp - first.timestamp,
      heapGrowthMB: heapGrowthMB.toFixed(2),
      rssGrowthMB: rssGrowthMB.toFixed(2),
      finalHeapUsedMB: (last.heapUsed / 1024 / 1024).toFixed(2),
      finalRssMB: (last.rss / 1024 / 1024).toFixed(2),
    });

    // Find jobs with largest memory increases
    const jobStarts = this.snapshots.filter(s => s.label.startsWith('job-start'));
    const jobEnds = this.snapshots.filter(s => s.label.startsWith('job-end'));

    const deltas: { label: string; deltaMB: number }[] = [];
    for (const start of jobStarts) {
      const epochMatch = start.label.match(/epoch-(\d+)/);
      if (epochMatch) {
        const end = jobEnds.find(e => e.label.includes(`epoch-${epochMatch[1]}`));
        if (end) {
          deltas.push({
            label: start.label,
            deltaMB: (end.heapUsed - start.heapUsed) / 1024 / 1024,
          });
        }
      }
    }

    if (deltas.length > 0) {
      deltas.sort((a, b) => b.deltaMB - a.deltaMB);
      log.info(`[MEMORY] Top memory increases by job:`, {
        top5: deltas.slice(0, 5).map(d => `${d.label}: ${d.deltaMB.toFixed(2)}MB`),
      });
    }
  }

  /** Write memory stats to a JSON file and optionally upload to GCS */
  async writeStatsFile(): Promise<string | undefined> {
    if (!this.enabled || this.snapshots.length === 0) {
      return undefined;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `memory-stats-${timestamp}.json`;
    const filepath = path.join(this.heapSnapshotDir, filename);

    // Build stats with human-readable values
    const stats = {
      generatedAt: new Date().toISOString(),
      jobCount: this.jobCounter,
      snapshotCount: this.snapshots.length,
      snapshots: this.snapshots.map(s => ({
        ...s,
        timestampISO: new Date(s.timestamp).toISOString(),
        heapUsedMB: (s.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (s.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: (s.rss / 1024 / 1024).toFixed(2),
        externalMB: (s.external / 1024 / 1024).toFixed(2),
        arrayBuffersMB: (s.arrayBuffers / 1024 / 1024).toFixed(2),
        nativeEstimateMB: ((s.rss - s.heapTotal - s.arrayBuffers) / 1024 / 1024).toFixed(2),
      })),
      summary: this.snapshots.length >= 2 ? this.computeSummary() : null,
      nativeWorldState: this.lastNativeStats
        ? {
            totalForks: Number(this.lastNativeStats.totalForks),
            forks: this.lastNativeStats.forks.map(f => ({
              forkId: Number(f.forkId),
              blockNumber: Number(f.blockNumber),
              noteHashTree: {
                nodes: Number(f.noteHashTreeStats.nodesCount),
                indices: Number(f.noteHashTreeStats.indicesCount),
                leaves: Number(f.noteHashTreeStats.leavesCount),
                nodesByIndex: Number(f.noteHashTreeStats.nodesByIndexCount),
                leafPreimages: Number(f.noteHashTreeStats.leafPreimageCount),
                journals: Number(f.noteHashTreeStats.journalsCount),
              },
              nullifierTree: {
                nodes: Number(f.nullifierTreeStats.nodesCount),
                indices: Number(f.nullifierTreeStats.indicesCount),
                leaves: Number(f.nullifierTreeStats.leavesCount),
                nodesByIndex: Number(f.nullifierTreeStats.nodesByIndexCount),
                leafPreimages: Number(f.nullifierTreeStats.leafPreimageCount),
                journals: Number(f.nullifierTreeStats.journalsCount),
              },
              publicDataTree: {
                nodes: Number(f.publicDataTreeStats.nodesCount),
                indices: Number(f.publicDataTreeStats.indicesCount),
                leaves: Number(f.publicDataTreeStats.leavesCount),
                nodesByIndex: Number(f.publicDataTreeStats.nodesByIndexCount),
                leafPreimages: Number(f.publicDataTreeStats.leafPreimageCount),
                journals: Number(f.publicDataTreeStats.journalsCount),
              },
              messageTree: {
                nodes: Number(f.messageTreeStats.nodesCount),
                indices: Number(f.messageTreeStats.indicesCount),
                leaves: Number(f.messageTreeStats.leavesCount),
                nodesByIndex: Number(f.messageTreeStats.nodesByIndexCount),
                leafPreimages: Number(f.messageTreeStats.leafPreimageCount),
                journals: Number(f.messageTreeStats.journalsCount),
              },
              archiveTree: {
                nodes: Number(f.archiveTreeStats.nodesCount),
                indices: Number(f.archiveTreeStats.indicesCount),
                leaves: Number(f.archiveTreeStats.leavesCount),
                nodesByIndex: Number(f.archiveTreeStats.nodesByIndexCount),
                leafPreimages: Number(f.archiveTreeStats.leafPreimageCount),
                journals: Number(f.archiveTreeStats.journalsCount),
              },
            })),
          }
        : null,
    };

    // Write to local file
    fs.writeFileSync(filepath, JSON.stringify(stats, null, 2));
    log.info(`[MEMORY] Stats written to ${filepath}`);

    // Upload to GCS if configured
    if (this.storage && this.gcsBucket) {
      try {
        const gcsPath = `${this.gcsPrefix}/${filename}`;
        await this.storage.bucket(this.gcsBucket).upload(filepath, {
          destination: gcsPath,
          metadata: {
            contentType: 'application/json',
          },
        });

        const gcsUri = `gs://${this.gcsBucket}/${gcsPath}`;
        log.info(`[MEMORY] Stats uploaded to ${gcsUri}`);

        if (process.env.PROVER_NODE_HEAP_SNAPSHOT_DELETE_LOCAL === '1') {
          fs.unlinkSync(filepath);
        }

        return gcsUri;
      } catch (err) {
        log.error(`[MEMORY] Failed to upload stats to GCS`, err);
        return filepath;
      }
    }

    return filepath;
  }

  /** Compute summary statistics */
  private computeSummary() {
    if (this.snapshots.length < 2) {
      return null;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    const jobDeltas: { epoch: string; heapDeltaMB: string; rssDeltaMB: string; nativeDeltaMB: string }[] = [];
    const jobStarts = this.snapshots.filter(s => s.label.startsWith('job-start'));
    const jobEnds = this.snapshots.filter(s => s.label.startsWith('job-end'));

    for (const start of jobStarts) {
      const epochMatch = start.label.match(/epoch-(\d+)/);
      if (epochMatch) {
        const end = jobEnds.find(e => e.label.includes(`epoch-${epochMatch[1]}`));
        if (end) {
          const startNative = start.rss - start.heapTotal - start.arrayBuffers;
          const endNative = end.rss - end.heapTotal - end.arrayBuffers;
          jobDeltas.push({
            epoch: epochMatch[1],
            heapDeltaMB: ((end.heapUsed - start.heapUsed) / 1024 / 1024).toFixed(2),
            rssDeltaMB: ((end.rss - start.rss) / 1024 / 1024).toFixed(2),
            nativeDeltaMB: ((endNative - startNative) / 1024 / 1024).toFixed(2),
          });
        }
      }
    }

    return {
      durationMs: last.timestamp - first.timestamp,
      totalHeapGrowthMB: ((last.heapUsed - first.heapUsed) / 1024 / 1024).toFixed(2),
      totalRssGrowthMB: ((last.rss - first.rss) / 1024 / 1024).toFixed(2),
      totalNativeGrowthMB: (
        (last.rss - last.heapTotal - last.arrayBuffers - (first.rss - first.heapTotal - first.arrayBuffers)) /
        1024 /
        1024
      ).toFixed(2),
      finalHeapUsedMB: (last.heapUsed / 1024 / 1024).toFixed(2),
      finalRssMB: (last.rss / 1024 / 1024).toFixed(2),
      jobDeltas,
    };
  }
}

/** Singleton instance for easy access */
let debuggerInstance: MemoryDebugger | undefined;

export function getMemoryDebugger(opts?: { heapSnapshotDir?: string; enabled?: boolean }): MemoryDebugger {
  if (!debuggerInstance) {
    debuggerInstance = new MemoryDebugger(opts);
  }
  return debuggerInstance;
}

/**
 * Track open native forks. Call when creating/closing forks to detect leaks.
 */
class ForkTracker {
  private openForks = new Map<number, { blockNumber: number; createdAt: number; stack: string }>();
  private forkIdCounter = 0;
  private enabled = process.env.PROVER_NODE_MEMORY_DEBUG === '1';

  createFork(blockNumber: number): number {
    if (!this.enabled) {
      return 0;
    }
    const id = ++this.forkIdCounter;
    this.openForks.set(id, {
      blockNumber,
      createdAt: Date.now(),
      stack: new Error().stack ?? '',
    });
    log.info(`[FORK] Created fork ${id} for block ${blockNumber}. Open forks: ${this.openForks.size}`);
    return id;
  }

  closeFork(id: number): void {
    if (!this.enabled || id === 0) {
      return;
    }
    const fork = this.openForks.get(id);
    if (fork) {
      const duration = Date.now() - fork.createdAt;
      this.openForks.delete(id);
      log.info(
        `[FORK] Closed fork ${id} for block ${fork.blockNumber} after ${duration}ms. Open forks: ${this.openForks.size}`,
      );
    } else {
      log.warn(`[FORK] Attempted to close unknown fork ${id}`);
    }
  }

  getOpenForkCount(): number {
    return this.openForks.size;
  }

  logOpenForks(): void {
    if (!this.enabled) {
      return;
    }
    if (this.openForks.size === 0) {
      log.info(`[FORK] No open forks`);
      return;
    }
    log.warn(`[FORK] ${this.openForks.size} forks still open:`);
    for (const [id, fork] of this.openForks) {
      const age = Date.now() - fork.createdAt;
      log.warn(`[FORK]   Fork ${id}: block ${fork.blockNumber}, age ${age}ms`);
    }
  }
}

let forkTrackerInstance: ForkTracker | undefined;

export function getForkTracker(): ForkTracker {
  if (!forkTrackerInstance) {
    forkTrackerInstance = new ForkTracker();
  }
  return forkTrackerInstance;
}
