import { type L2BlockSource } from '@aztec/circuit-types';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import {
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

export interface EpochMonitorHandler {
  handleInitialEpochSync(epochNumber: bigint): Promise<void>;
  handleEpochCompleted(epochNumber: bigint): Promise<void>;
}

export class EpochMonitor implements Traceable {
  private runningPromise: RunningPromise;
  private log = createLogger('prover-node:epoch-monitor');
  public readonly tracer: Tracer;

  private handler: EpochMonitorHandler | undefined;

  private latestEpochNumber: bigint | undefined;

  constructor(
    private readonly l2BlockSource: L2BlockSource,
    private options: { pollingIntervalMs: number },
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    this.tracer = telemetry.getTracer('EpochMonitor');
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.options.pollingIntervalMs);
  }

  public start(handler: EpochMonitorHandler) {
    this.handler = handler;
    this.runningPromise.start();
    this.log.info('Started EpochMonitor', this.options);
  }

  public async stop() {
    await this.runningPromise.stop();
    this.log.info('Stopped EpochMonitor');
  }

  @trackSpan('EpochMonitor.work')
  public async work() {
    if (!this.latestEpochNumber) {
      const epochNumber = await this.l2BlockSource.getL2EpochNumber();
      if (epochNumber > 0n) {
        await this.handler?.handleInitialEpochSync(epochNumber - 1n);
      }
      this.latestEpochNumber = epochNumber;
      return;
    }

    if (await this.l2BlockSource.isEpochComplete(this.latestEpochNumber)) {
      await this.handler?.handleEpochCompleted(this.latestEpochNumber);
      this.latestEpochNumber += 1n;
    }
  }
}
