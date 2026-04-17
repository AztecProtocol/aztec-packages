import { appendFileSync } from 'node:fs';
import { type EventLoopUtilization, type IntervalHistogram, monitorEventLoopDelay, performance } from 'node:perf_hooks';

const NANOS_PER_MS = 1_000_000;
const BYTES_PER_MB = 1024 * 1024;
const US_PER_MS = 1000;

/** Summary stats returned by getSummaryStats() for aggregate reporting. */
export type EluSummaryStats = {
  label: string;
  meanElu: number;
  maxElu: number;
  p90Elu: number;
  durationS: number;
  meanCpuU: number;
  maxCpuU: number;
  peakRss: number;
  peakHeap: number;
};

/**
 * Samples event-loop utilization, delay histogram, V8 heap, per-process CPU usage, and RSS memory per test.
 * Writes columnar text to a per-test file that CI uploads for post-run analysis.
 *
 * When used in worker threads, pass a `label` (e.g. "Worker 0") to identify the section in the shared ELU file.
 */
export class EluMonitor {
  private filePath: string;
  private intervalMs: number;
  private label: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastELU: EventLoopUtilization | undefined;
  private histogram: IntervalHistogram;
  private testName: string | undefined;
  private testStart: number | undefined;
  private eluSamples: number[] = [];
  private cpuUserSamples: number[] = [];
  private cpuSystemSamples: number[] = [];
  private rssSamples: number[] = [];
  private heapSamples: number[] = [];
  private lastCpuUsage: NodeJS.CpuUsage | undefined;
  private lastSampleTime: number | undefined;
  private lastSummaryStats: EluSummaryStats | undefined;

  /**
   * @param filePath - Path to the ELU output file (shared across main thread and workers).
   * @param intervalMs - Sampling interval in milliseconds (default 2000).
   * @param label - Optional label for this monitor's section (e.g. "Worker 0"). If set, the section
   *   header uses this label instead of the test name, and the summary line is prefixed with it.
   */
  constructor(filePath: string, intervalMs?: number, label?: string) {
    this.filePath = filePath;
    this.intervalMs = intervalMs ?? 2000;
    this.label = label;
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
  }

  /** Begin sampling for a test. Writes a header line and starts the periodic sampler. */
  startTest(testName: string): void {
    this.stopTest();

    this.testName = testName;
    this.testStart = performance.now();
    this.eluSamples = [];
    this.cpuUserSamples = [];
    this.cpuSystemSamples = [];
    this.rssSamples = [];
    this.heapSamples = [];
    this.lastCpuUsage = undefined;
    this.lastSampleTime = undefined;

    const header = this.label ? `--- ${this.label} ---` : `=== Test: ${testName} ===`;
    appendFileSync(this.filePath, `\n${header}\n`);
    appendFileSync(
      this.filePath,
      padColumns('TIME', 'ELU', 'EL_DLY_P50', 'EL_DLY_P99', 'EL_DLY_MAX', 'HEAP_MB', 'CPU_U', 'CPU_S', 'RSS_MB') + '\n',
    );

    this.lastELU = performance.eventLoopUtilization();
    this.histogram.enable();

    this.timer = setInterval(() => this.sample(), this.intervalMs);
    // Allow the process to exit even if the timer is still running.
    this.timer.unref();
  }

  /** Stop sampling and write a summary line. */
  stopTest(): void {
    if (!this.timer) {
      return;
    }

    // Take a final sample before stopping.
    this.sample();

    clearInterval(this.timer);
    this.timer = undefined;
    this.histogram.disable();
    this.histogram.reset();

    this.writeSummary();

    this.lastELU = undefined;
    this.testName = undefined;
    this.testStart = undefined;
    this.eluSamples = [];
    this.cpuUserSamples = [];
    this.cpuSystemSamples = [];
    this.rssSamples = [];
    this.heapSamples = [];
    this.lastCpuUsage = undefined;
    this.lastSampleTime = undefined;
  }

  /** Alias for stopTest — call on process exit to flush any remaining data. */
  stop(): void {
    this.stopTest();
  }

  private sample(): void {
    const nowMs = performance.now();

    const newELU = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(newELU, this.lastELU);
    this.lastELU = newELU;

    const elu = delta.utilization;
    this.eluSamples.push(elu);

    const p50 = this.histogram.percentile(50) / NANOS_PER_MS;
    const p99 = this.histogram.percentile(99) / NANOS_PER_MS;
    const max = this.histogram.max / NANOS_PER_MS;

    const memUsage = process.memoryUsage();
    const heapMb = Math.round(memUsage.heapUsed / BYTES_PER_MB);
    const rssMb = Math.round(memUsage.rss / BYTES_PER_MB);
    this.heapSamples.push(heapMb);
    this.rssSamples.push(rssMb);

    // CPU usage: compute delta since last sample. First sample has no baseline so report 0.0.
    let cpuUserPct = 0;
    let cpuSystemPct = 0;
    const currentCpuUsage = process.cpuUsage();
    if (this.lastCpuUsage !== undefined && this.lastSampleTime !== undefined) {
      const cpuDelta = process.cpuUsage(this.lastCpuUsage);
      const wallElapsedUs = (nowMs - this.lastSampleTime) * US_PER_MS;
      if (wallElapsedUs > 0) {
        cpuUserPct = (cpuDelta.user / wallElapsedUs) * 100;
        cpuSystemPct = (cpuDelta.system / wallElapsedUs) * 100;
      }
    }
    this.lastCpuUsage = currentCpuUsage;
    this.lastSampleTime = nowMs;
    this.cpuUserSamples.push(cpuUserPct);
    this.cpuSystemSamples.push(cpuSystemPct);

    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');

    const line = padColumns(
      time,
      elu.toFixed(2),
      `${p50.toFixed(1)}ms`,
      `${p99.toFixed(1)}ms`,
      `${max.toFixed(1)}ms`,
      String(heapMb),
      cpuUserPct.toFixed(1),
      cpuSystemPct.toFixed(1),
      String(rssMb),
    );
    appendFileSync(this.filePath, line + '\n');

    // Reset histogram so next sample only reflects the new interval.
    this.histogram.reset();
  }

  /** Returns the summary stats from the last completed test, or undefined if no test has been run. */
  getSummaryStats(): EluSummaryStats | undefined {
    return this.lastSummaryStats;
  }

  private writeSummary(): void {
    if (this.eluSamples.length === 0 || this.testStart === undefined) {
      return;
    }

    const mean = this.eluSamples.reduce((a, b) => a + b, 0) / this.eluSamples.length;
    const maxElu = Math.max(...this.eluSamples);
    const sorted = [...this.eluSamples].sort((a, b) => a - b);
    const p90Elu = sorted[Math.floor(sorted.length * 0.9)] ?? maxElu;
    const durationS = (performance.now() - this.testStart) / 1000;

    const meanCpuU =
      this.cpuUserSamples.length > 0 ? this.cpuUserSamples.reduce((a, b) => a + b, 0) / this.cpuUserSamples.length : 0;
    const maxCpuU = this.cpuUserSamples.length > 0 ? Math.max(...this.cpuUserSamples) : 0;
    const meanCpuS =
      this.cpuSystemSamples.length > 0
        ? this.cpuSystemSamples.reduce((a, b) => a + b, 0) / this.cpuSystemSamples.length
        : 0;
    const maxCpuS = this.cpuSystemSamples.length > 0 ? Math.max(...this.cpuSystemSamples) : 0;
    const peakRss = this.rssSamples.length > 0 ? Math.max(...this.rssSamples) : 0;
    const peakHeap = this.heapSamples.length > 0 ? Math.max(...this.heapSamples) : 0;

    this.lastSummaryStats = {
      label: this.label ?? this.testName ?? 'unknown',
      meanElu: mean,
      maxElu,
      p90Elu,
      durationS,
      meanCpuU,
      maxCpuU,
      peakRss,
      peakHeap,
    };

    const prefix = this.label ? `[${this.label}] ` : '';
    let summary = `--- ${prefix}Summary: mean_elu=${mean.toFixed(2)} max_elu=${maxElu.toFixed(2)} p90_elu=${p90Elu.toFixed(2)} duration=${durationS.toFixed(1)}s`;
    summary += ` mean_cpu_u=${meanCpuU.toFixed(2)} max_cpu_u=${maxCpuU.toFixed(2)}`;
    summary += ` mean_cpu_s=${meanCpuS.toFixed(2)} max_cpu_s=${maxCpuS.toFixed(2)}`;
    summary += ` peak_rss=${peakRss} peak_heap=${peakHeap}`;
    if (maxElu > 0.85) {
      summary += ' WARNING:ELU>0.85';
    }
    summary += ' ---\n';

    appendFileSync(this.filePath, summary);
  }
}

/**
 * Writes an aggregate summary line to the ELU file, showing all workers' key metrics side by side.
 * Call this from the main thread after all workers have stopped and reported their stats.
 */
export function writeAggregateEluSummary(filePath: string, stats: EluSummaryStats[]): void {
  if (stats.length === 0) {
    return;
  }
  let line = '\n=== Aggregate ===\n';
  for (const s of stats) {
    line += `${s.label}: mean_elu=${s.meanElu.toFixed(2)} p90_elu=${s.p90Elu.toFixed(2)} peak_rss=${s.peakRss}  `;
  }
  line += '\n';
  appendFileSync(filePath, line);
}

function padColumns(...cols: string[]): string {
  const widths = [11, 7, 12, 12, 12, 8, 8, 8, 8];
  return cols.map((col, i) => col.padEnd(widths[i] ?? 10)).join('');
}
