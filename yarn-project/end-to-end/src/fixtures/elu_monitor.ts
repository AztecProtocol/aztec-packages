import { appendFileSync } from 'node:fs';
import { type EventLoopUtilization, type IntervalHistogram, monitorEventLoopDelay, performance } from 'node:perf_hooks';

const NANOS_PER_MS = 1_000_000;

/** Samples event-loop utilization, delay histogram, and heap usage per test, writing columnar text to a file. */
export class EluMonitor {
  private filePath: string;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastELU: EventLoopUtilization | undefined;
  private histogram: IntervalHistogram;
  private testName: string | undefined;
  private testStart: number | undefined;
  private eluSamples: number[] = [];

  constructor(filePath: string, intervalMs?: number) {
    this.filePath = filePath;
    this.intervalMs = intervalMs ?? 2000;
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
  }

  /** Begin sampling for a test. Writes a header line and starts the periodic sampler. */
  startTest(testName: string): void {
    this.stopTest();

    this.testName = testName;
    this.testStart = performance.now();
    this.eluSamples = [];

    appendFileSync(this.filePath, `\n=== Test: ${testName} ===\n`);
    appendFileSync(
      this.filePath,
      padColumns('TIME', 'ELU', 'EL_DLY_P50', 'EL_DLY_P99', 'EL_DLY_MAX', 'HEAP_MB') + '\n',
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
  }

  /** Alias for stopTest — call on process exit to flush any remaining data. */
  stop(): void {
    this.stopTest();
  }

  private sample(): void {
    const newELU = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(newELU, this.lastELU);
    this.lastELU = newELU;

    const elu = delta.utilization;
    this.eluSamples.push(elu);

    const p50 = this.histogram.percentile(50) / NANOS_PER_MS;
    const p99 = this.histogram.percentile(99) / NANOS_PER_MS;
    const max = this.histogram.max / NANOS_PER_MS;
    const heapMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));

    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');

    const line = padColumns(
      time,
      elu.toFixed(2),
      `${p50.toFixed(1)}ms`,
      `${p99.toFixed(1)}ms`,
      `${max.toFixed(1)}ms`,
      String(heapMb),
    );
    appendFileSync(this.filePath, line + '\n');

    // Reset histogram so next sample only reflects the new interval.
    this.histogram.reset();
  }

  private writeSummary(): void {
    if (this.eluSamples.length === 0 || this.testStart === undefined) {
      return;
    }

    const mean = this.eluSamples.reduce((a, b) => a + b, 0) / this.eluSamples.length;
    const maxElu = Math.max(...this.eluSamples);
    const sorted = [...this.eluSamples].sort((a, b) => a - b);
    const p90Elu = sorted[Math.floor(sorted.length * 0.9)] ?? maxElu;
    const durationS = ((performance.now() - this.testStart) / 1000).toFixed(1);

    let summary = `--- Summary: mean_elu=${mean.toFixed(2)} max_elu=${maxElu.toFixed(2)} p90_elu=${p90Elu.toFixed(2)} duration=${durationS}s`;
    if (maxElu > 0.85) {
      summary += ' WARNING:ELU>0.85';
    }
    summary += ' ---\n';

    appendFileSync(this.filePath, summary);
  }
}

function padColumns(...cols: string[]): string {
  const widths = [11, 7, 12, 12, 12, 8];
  return cols.map((col, i) => col.padEnd(widths[i] ?? 10)).join('');
}
